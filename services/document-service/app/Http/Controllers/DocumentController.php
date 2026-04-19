<?php

namespace App\Http\Controllers;

use App\Models\Document;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DocumentController extends Controller
{
    public function generate(Request $request)
    {
        $validated = $request->validate([
            'form_data' => 'required|array',  // values to fill
        ]);

         $doc = $request->user()->documents()->create([
        'form_data' => $validated['form_data'],
        'status' => 'queued',
        ]);

        GeneratePdfJob::dispatch($doc->id);
    
        return response()->json([
            'success' => true,
            'document_id' => $doc->id,
            'status' => $doc->status,
        ], 202);
    }

    public function show(int $id)
    {
        $doc = $request->user()
            ->documents()
            ->findOrFail($id);

        return response()->json($doc);
    }

    public function download(int $id)
    {
        $doc = Document::findOrFail($id);
        $doc = $request->user()
                    ->documents()
                    ->findOrFail($id);

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
            "SALN-{$doc->user_id}-{$doc->id}.pdf"
        );
    }

}