<?php

use App\Http\Controllers\Api\FormApiController;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json([
        'service' => 'form-service',
        'status' => 'ok',
        'timestamp' => now()->toIso8601String(),
    ]);
});

Route::prefix('forms')->middleware('auth.introspect')->group(function () {
    Route::get('/latest', [FormApiController::class, 'latest']);
    Route::post('/save', [FormApiController::class, 'save']);
    Route::get('/export', [FormApiController::class, 'export']);
    Route::post('/import', [FormApiController::class, 'import']);
    Route::post('/new', [FormApiController::class, 'newEntry']);
});

Route::post('/forms/purge', [FormApiController::class, 'purge'])->middleware('internal.token');
