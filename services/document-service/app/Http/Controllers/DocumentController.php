<?php

namespace App\Http\Controllers;

use App\Jobs\GeneratePdfJob;
use App\Models\Document;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DocumentController extends Controller
{
    public function generate(Request $request)
    {
        $validated = $request->validate([
            'form_data' => 'required|array',
        ]);

        $doc = Document::create([
            'form_data' => $validated['form_data'],
            'status' => 'queued',
        ]);

        GeneratePdfJob::dispatch($doc->id); // keep internal numeric id for the job if you want

        return response()->json([
            'success' => true,
            'document_id' => $doc->public_id, // expose public id
            'status' => $doc->status,
        ], 202);
    }

    public function show(Document $doc)
    {
        return response()->json([
            'success' => true,
            'data' => [
                'id' => $doc->public_id,
                'status' => $doc->status,
                'created_at' => $doc->created_at,
                'updated_at' => $doc->updated_at,
                'preview_url' => url("/api/documents/{$doc->public_id}/preview"),
                'download_url' => url("/api/documents/{$doc->public_id}/download"),
            ],
        ]);
    }

    public function preview(Document $doc)
    {
        if ($doc->status !== 'completed' || !$doc->output_path) {
            return response()->json([
                'success' => false,
                'message' => 'Document not ready for preview.',
                'status' => $doc->status,
            ], 409);
        }

        if (!Storage::disk('local')->exists($doc->output_path)) {
            return response()->json([
                'success' => false,
                'message' => 'Generated file is missing from storage.',
            ], 404);
        }

        $absolutePath = Storage::disk('local')->path($doc->output_path);
        $filename = "SALN-{$doc->public_id}.pdf";

        return response()->file($absolutePath, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="'.$filename.'"',
        ]);
    }

    public function download(Document $doc)
    {
        if ($doc->status !== 'completed' || !$doc->output_path) {
            return response()->json([
                'success' => false,
                'message' => 'Document not ready for download.',
                'status' => $doc->status,
            ], 409);
        }

        if (!Storage::disk('local')->exists($doc->output_path)) {
            return response()->json([
                'success' => false,
                'message' => 'Generated file is missing from storage.',
            ], 404);
        }

        return Storage::disk('local')->download(
            $doc->output_path,
            "SALN-{$doc->public_id}.pdf"
        );
    }
}