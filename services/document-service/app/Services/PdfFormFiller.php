<?php

namespace App\Services;

use App\Models\Document;
use mikehaertl\pdftk\Pdf;
use RuntimeException;

class PdfFormFiller
{
    public function fillToFile(string $templateKey, array $mappedData, int $index, Document $doc): string
    {

        $pdfPath = base_path("pdf/{$templateKey}.pdf");
        if (!file_exists($pdfPath)) {
            throw new RuntimeException("Template PDF not found: {$pdfPath}");
        }

        $outDir = storage_path("app/tmp");
        if (!is_dir($outDir)) {
            mkdir($outDir, 0775, true);
        }

        $outPath = "{$outDir}/SALN-{$doc->user_id}-{$doc->id}-{$index}.pdf";

        $pdf = new Pdf($pdfPath);

        $ok = $pdf->fillForm($mappedData)
            ->needAppearances()
            ->saveAs($outPath);

        if ($ok === false) {
            throw new RuntimeException("pdftk failed: " . $pdf->getError());
        }

        return $outPath;
    }
}