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

        // Lambda /var/task is read-only; use system temp dir (/tmp in Lambda)
        $outDir = sys_get_temp_dir() . '/saln';
        if (!is_dir($outDir)) {
            mkdir($outDir, 0775, true);
        }

        $outPath = "{$outDir}/SALN-{$doc->public_id}-{$index}.pdf";

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