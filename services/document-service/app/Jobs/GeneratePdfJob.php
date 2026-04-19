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

class GeneratePdfJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public int $documentId, public int $userId)
    {
    }

    public function handle(
        PdfFormFiller $filler,
        PdfFormMapper $mapper,
    ): void {
        
        $doc = Document::whereKey($this->documentId)
            ->where('user_id', $this->userId)
            ->firstOrFail();

        $doc->update([
            'status' => 'processing',
            'error_message' => null,
        ]);

        try {
            // 1) Map your stored form_data into the field/value structure needed by the template
            $mappedData = $mapper->map($doc->form_data);

            // 2) Fill template -> raw PDF bytes
            $filledBasePath = $filler->fillToFile($doc->template, $mappedData);

            // 3) Merge (implementation pending)
            // TODO: $mergedPath = $merger->mergeToFile([$filledBasePath, ...$annexPaths]);

            // 4) Store merged bytes
            $fileName = "generated/SALN-{$doc->user_id}-{$doc->id}.pdf";
            Storage::disk('local')->put($fileName, file_get_contents($filledBasePath));


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