<?php

namespace App\Jobs;

use App\Models\Document;
use App\Services\PdfFormFiller;
use App\Services\PdfFormMapper;
use Exception;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

use mikehaertl\pdftk\Pdf;
use RuntimeException;

class GeneratePdfJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    // helper functions for checking if rows have real values (for annex c)
    private static function hasRealValues(array $row): bool
    {
        foreach ($row as $value) {
            if ($value !== null && $value !== '') {
                return true;
            }
        }
        return false;
    }

    private static function hasRealEntries(array $rows): bool
    {
        return !empty(array_filter(
            $rows,
            fn($row) => self::hasRealValues($row)
        ));
    }

    public function __construct(public int $documentId)
    {
    }

    public function handle(
        PdfFormFiller $filler,
        PdfFormMapper $mapper,
    ): void {
        
        $doc = Document::findOrFail($this->documentId);

        $doc->update([
            'status' => 'processing',
            'error_message' => null,
        ]);

        try {
            
            $fileTempPaths = [];
            $page_index = 0;
            $page_index_spouse = 0;
            $form_data = $doc->form_data; // lazy to change $form->data -> doc->form_data
            
            // for declarant
            $temp = $form_data['business_interests']['declarant'] ?? ['has_business_interest' => false, 'entries' => []];

            if (array_key_exists('assets', $form_data)){
                
                if (count($form_data['assets']['declarant']['real_properties']) > 4){
                    $page_index = max([$page_index, (int) ceil(count($form_data['assets']['declarant']['real_properties'] ?? 0)/4) - 1]);
                }

                if (count($form_data['assets']['declarant']['personal_properties']) > 6){
                    $page_index = max([$page_index, (int) ceil(count($form_data['assets']['declarant']['personal_properties'] ?? 0)/6) - 1]);
                }

                if (count($temp['entries']) > 3){
                    $page_index = max([$page_index, (int) ceil(count($temp['entries'] ?? 0)/3) - 1]);
                }

                if (count($form_data['liabilities']['declarant']) > 4){
                    $page_index = max([$page_index, (int) ceil(count($form_data['liabilities']['declarant'] ?? 0)/4) - 1]);
                } 

            } else{
                    $overflows = [['real_properties',4],
                                ['personal_properties',6],
                                ['business_interests',3],
                                ['liabilities',4]];

                    foreach ($overflows as [$type, $size])
                    {
                        if (count($form_data[$type] ?? 0) > $size)
                        {
                            $page_index = max([$page_index, (int) ceil(count($form_data[$type] ?? 0)/$size) - 1]);
                        };
                    }

            }

            $temp_spouse_children = $form_data['business_interests']['spouse_children'] ?? ['has_spouse_children' => false, 'entries' => []];

            if (array_key_exists('assets', $form_data)){
                
                if (count($form_data['assets']['spouse_children']['real_properties']) > 4){
                    $page_index_spouse = max([$page_index_spouse, (int) ceil(count($form_data['assets']['spouse_children']['real_properties'] ?? 0)/4) - 1]);
                }

                if (count($form_data['assets']['spouse_children']['personal_properties']) > 4){
                    $page_index_spouse = max([$page_index_spouse, (int) ceil(count($form_data['assets']['spouse_children']['personal_properties'] ?? 0)/4) - 1]);
                }

                if (count($temp_spouse_children['entries']) > 3){
                    $page_index_spouse = max([$page_index_spouse, (int) ceil(count($temp_spouse_children['entries'] ?? 0)/3) - 1]);
                }

                if (count($form_data['liabilities']['spouse_children']) > 4){
                    $page_index_spouse = max([$page_index_spouse, (int) ceil(count($form_data['liabilities']['spouse_children'] ?? 0)/4) - 1]);
                } 
            }else{
                    $overflows = [['real_properties',4],
                                ['personal_properties',4],
                                ['business_interests',3],
                                ['liabilities',4]];

                    foreach ($overflows as [$type, $size])
                    {
                        if (count($form_data[$type] ?? 0) > $size)
                        {
                            $page_index_spouse = max([$page_index_spouse, (int) ceil(count($form_data[$type] ?? 0)/$size) - 1]);
                        };
                    }
                
            }

            if (array_key_exists('assets', $form_data)){
                $pages = [
                'real' => array_chunk($form_data['assets']['declarant']['real_properties'], 4),
                'personal' => array_chunk($form_data['assets']['declarant']['personal_properties'], 6),
                'bus' => array_chunk($temp['entries'], 3),
                'liab' => array_chunk($form_data['liabilities']['declarant'], 4),
            ];
            }else{
            $pages = [
                'real' => array_chunk($form_data['real_properties'], 4),
                'personal' => array_chunk($form_data['personal_properties'], 6),
                'bus' => array_chunk($form_data['business_interests'], 3),
                'liab' => array_chunk($form_data['liabilities'], 4),
            ];
            }

            if (array_key_exists('assets', $form_data)){
                $pages_spouse = [
                'real' => array_chunk($form_data['assets']['spouse_children']['real_properties'], 4),
                'personal' => array_chunk($form_data['assets']['spouse_children']['personal_properties'], 4),
                'bus' => array_chunk($temp_spouse_children['entries'], 3),
                'liab' => array_chunk($form_data['liabilities']['spouse_children'], 4),
            ];
            } else {
                $pages_spouse = [
                'real' => array_chunk($form_data['real_properties'], 4),
                'personal' => array_chunk($form_data['personal_properties'], 4),
                'bus' => array_chunk($form_data['business_interests'], 3),
                'liab' => array_chunk($form_data['liabilities'], 4),
            ];
            }

            $has_spouse_data =
                self::hasRealEntries($form_data['assets']['spouse_children']['real_properties'] ?? []) ||
                self::hasRealEntries($form_data['assets']['spouse_children']['personal_properties'] ?? []) ||
                self::hasRealEntries($temp_spouse_children['entries'] ?? []) ||
                self::hasRealEntries($form_data['liabilities']['spouse_children'] ?? []);

            $total_pages = $page_index + 2;

            // +1 for the first page of spouse (annex C)
            // only add the pages for spouse if there is data for spouse, otherwise skip annex C entirely
            if ($has_spouse_data) {
                $total_pages += ($page_index_spouse + 1);
            } 

            for ($i = 0; $i < $total_pages; $i++)
            {
                if ($i < $page_index + 2) {
                    // DECLARANT (Annex A + B)

                    if (array_key_exists('assets', $form_data)){
                        $form_data['assets']['declarant']['real_properties'] = $pages['real'][$i] ?? [];
                        $form_data['assets']['declarant']['personal_properties'] = $pages['personal'][$i] ?? [];
                        $form_data['business_interests']['declarant']['entries'] = $pages['bus'][$i] ?? []; 
                    }else{
                        $form_data['real_properties'] = $pages['real'][$i] ?? [];
                        $form_data['personal_properties'] = $pages['personal'][$i] ?? [];
                        $form_data['business_interests'] = $pages['bus'][$i] ?? [];
                    }

                    $form_data['liabilities']['declarant'] = $pages['liab'][$i] ?? [];

                    if ($i === 0){
                        // print("Page index: {$i} inside A \n");

                        if (array_key_exists('assets', $form_data)){
                        $form_data['assets']['declarant']['real_properties'] = $pages['real'][$i] ?? [];
                        $form_data['assets']['declarant']['personal_properties'] = $pages['personal'][$i] ?? [];
                        $form_data['business_interests']['declarant']['entries'] = $pages['bus'][$i] ?? []; 
                        }else{
                            $form_data['real_properties'] = $pages['real'][$i] ?? [];
                            $form_data['personal_properties'] = $pages['personal'][$i] ?? [];
                            $form_data['business_interests'] = $pages['bus'][$i] ?? [];
                        }

                        $form_data['liabilities']['declarant'] = $pages['liab'][$i] ?? [];

                        $mappedData = $mapper->mapA($form_data, (string) $total_pages);
                        $fileTempPaths[] = $filler->fillToFile('annexA', $mappedData,$i,$doc);
                    }

                    elseif ($i === 1){
                    continue; // skip, this is the second page of annex A which is blank
                    }

                    else{
                        // print("Page index: {$i} inside B \n");
                    
                        $local_i = $i - 1; // -1 because the first page of annex A is not counted in the pages for annex B
                        if (array_key_exists('assets', $form_data)){
                        $form_data['assets']['declarant']['real_properties'] = $pages['real'][$local_i] ?? [];
                        $form_data['assets']['declarant']['personal_properties'] = $pages['personal'][$local_i] ?? [];
                        $form_data['business_interests']['declarant']['entries'] = $pages['bus'][$local_i] ?? []; 
                        }else{
                            $form_data['real_properties'] = $pages['real'][$local_i] ?? [];
                            $form_data['personal_properties'] = $pages['personal'][$local_i] ?? [];
                            $form_data['business_interests'] = $pages['bus'][$local_i] ?? [];
                        }

                        $form_data['liabilities']['declarant'] = $pages['liab'][$local_i] ?? [];

                        $mappedData = $mapper->mapB($form_data, (string) $total_pages, (string) ($i + 1));
                        $fileTempPaths[] = $filler->fillToFile('annexB', $mappedData,$i,$doc);
                    }

                } else if ($has_spouse_data)  {
                    // SPOUSE (Annex C)
                    // print("Page index: {$i} inside C\n");
                    $local_i = $i - ($page_index + 2);

                    if (array_key_exists('assets', $form_data)){
                        $form_data['assets']['spouse_children']['real_properties'] = $pages_spouse['real'][$local_i] ?? [];
                        $form_data['assets']['spouse_children']['personal_properties'] = $pages_spouse['personal'][$local_i] ?? [];
                        $form_data['business_interests']['spouse_children']['entries'] = $pages_spouse['bus'][$local_i] ?? []; 
                    }else{
                        $form_data['real_properties'] = $pages_spouse['real'][$local_i] ?? [];
                        $form_data['personal_properties'] = $pages_spouse['personal'][$local_i] ?? [];
                        $form_data['business_interests'] = $pages_spouse['bus'][$local_i] ?? [];
                    }

                    $form_data['liabilities']['spouse_children'] = $pages_spouse['liab'][$local_i] ?? [];

                    $mappedData = $mapper->mapC($form_data, (string) $total_pages, (string) ($i + 1));
                    $fileTempPaths[] = $filler->fillToFile('annexC', $mappedData,$i, $doc);
                }
            }

            // merge into final
            $mergedTmpDir = storage_path("app/tmp");
            $mergedTmpPath = "{$mergedTmpDir}/SALN-merged.pdf";
            
            $pdf = new Pdf($fileTempPaths);
            $result = $pdf->needAppearances()->saveAs($mergedTmpPath);
            
            if ($result === false) {
                throw new RuntimeException("pdftk merge failed: " . $pdf->getError());
            }
            
            $fileName = "generated/SALN-{$doc->public_id}.pdf";
            Storage::disk('local')->put($fileName, file_get_contents($mergedTmpPath));

            // del temps
            if (is_file($mergedTmpPath) && !unlink($mergedTmpPath)) {
                throw new \RuntimeException("Failed to delete temp file: {$mergedTmpPath}");
            }

            foreach ($fileTempPaths as $filepath) {
                if (is_file($filepath) && !unlink($filepath)) {
                    throw new \RuntimeException("Failed to delete temp file: {$filepath}");
                }
            }

            $doc->update([
                'status' => 'completed',
                'output_path' => $fileName,
            ]);
        } catch (Exception $e) {
            $doc->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
            ]);

            throw $e;
        }
    }
}