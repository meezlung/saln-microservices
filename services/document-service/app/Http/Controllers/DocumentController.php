<?php

namespace App\Http\Controllers;

use App\Jobs\GeneratePdfJob;
use App\Models\Document;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DocumentController extends Controller
{
    private function resolveUserId(Request $request): ?string
    {
        $userId = $request->header('X-User-Id')
            ?? $request->query('user_id')
            ?? $request->input('user_id');

        if (!is_string($userId) || !Str::isUuid($userId)) {
            return null;
        }

        return $userId;
    }

    private function forbidIfNotOwner(Request $request, Document $doc)
    {
        $userId = $this->resolveUserId($request);

        if (!$userId || $doc->owner_user_id !== $userId) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden.',
            ], 403);
        }

        return null;
    }

    public function generate(Request $request)
    {
        $validated = $request->validate([
            'form_data' => 'required|array',
        ]);

        $userId = $this->resolveUserId($request);

        if (!$userId) {
            return response()->json([
                'success' => false,
                'message' => 'Missing or invalid user ID.',
            ], 422);
        }

        $doc = Document::create([
            'owner_user_id' => $userId,
            'form_data' => $validated['form_data'],
            'status' => 'queued',
        ]);

        GeneratePdfJob::dispatch($doc->id);

        return response()->json([
            'success' => true,
            'document_id' => $doc->public_id,
            'status' => $doc->status,
        ], 202);
    }

    public function show(Request $request, Document $doc)
    {
        // if ($resp = $this->forbidIfNotOwner($request, $doc)) {
        //     return $resp;
        // }

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

    public function preview(Request $request, Document $doc)
    {
        // if ($resp = $this->forbidIfNotOwner($request, $doc)) {
        //     return $resp;
        // }

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

    public function download(Request $request, Document $doc)
    {
        // if ($resp = $this->forbidIfNotOwner($request, $doc)) {
        //     return $resp;
        // }

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

    public function purge(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'required|uuid',
        ]);

        $userId = $validated['user_id'];

        // get documents first so we can delete their files
        $docs = Document::where('owner_user_id', $userId)->get();

        foreach ($docs as $doc) {
            if ($doc->output_path && Storage::disk('local')->exists($doc->output_path)) {
                Storage::disk('local')->delete($doc->output_path);
            }
        }

        // del DB rows (after file cleanup)
        Document::where('owner_user_id', $userId)->delete();

        return response()->json([
            'success' => true,
            'message' => 'User document data purged.',
            'deleted_documents' => $docs->count(),
        ]);
    }
}