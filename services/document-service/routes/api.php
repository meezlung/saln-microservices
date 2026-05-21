<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\DocumentController;

Route::get('/health', function () {
    return response()->json([
        'service' => 'document-service',
        'status' => 'ok',
        'timestamp' => now()->toIso8601String(),
    ]);
});

Route::middleware('auth.introspect')->group(function () {
    Route::post('/generate', [DocumentController::class, 'generate']);
    Route::get('/{doc}', [DocumentController::class, 'show']);
    Route::get('/{doc}/preview', [DocumentController::class, 'preview']);
    Route::get('/{doc}/download', [DocumentController::class, 'download']);
});

Route::post('/purge', [DocumentController::class, 'purge'])->middleware('internal.token');

// Back-compat for direct calls that don't pass through a prefix-stripping gateway/proxy.
Route::post('/documents/purge', [DocumentController::class, 'purge'])->middleware('internal.token');