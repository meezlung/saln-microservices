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

Route::prefix('documents')->group(function () {
    Route::post('/generate', [DocumentController::class, 'generate']);
    Route::get('/{doc}', [DocumentController::class, 'show']);
    Route::get('/{doc}/preview', [DocumentController::class, 'preview']);
    Route::get('/{doc}/download', [DocumentController::class, 'download']);
});