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
            $form_data = $doc->form_data; // lazy to change $form->data -> doc->form_data

            $overflows = [['real_properties',4],
                        ['personal_properties',6],
                        ['business_interests',3],
                        ['liabilities',4]];

            foreach ($overflows as [$type, $size])
            {
                if (count($form_data[$type]) > $size)
                {
                    $page_index = max([$page_index, count($form_data[$type])%$size]);
                };
            }

            $pages = [
                'real' => array_chunk($form_data['real_properties'], 4),
                'personal' => array_chunk($form_data['personal_properties'], 6),
                'bus' => array_chunk($form_data['business_interests'], 3),
                'liab' => array_chunk($form_data['liabilities'], 4),
            ];


            for ($i = 0;$i<=$page_index;$i++)
            {
                $form_data['real_properties'] = $pages['real'][$i] ?? [];
                $form_data['personal_properties'] = $pages['personal'][$i] ?? [];
                $form_data['business_interests'] = $pages['bus'][$i] ?? [];
                $form_data['liabilities'] = $pages['liab'][$i] ?? [];

                if ($i === 0){
                    $mappedData = $mapper->mapA($form_data);
                    $fileTempPaths[] = $filler->fillToFile('annexA', $mappedData,$i,$doc);
                }
                else{
                    $mappedData = $mapper->mapB($form_data);
                    $fileTempPaths[] = $filler->fillToFile('annexB', $mappedData,$i,$doc);
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
            
            $fileName = "generated/SALN-{$doc->id}.pdf";
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