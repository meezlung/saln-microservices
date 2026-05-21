<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class InternalServiceToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = (string) env('INTERNAL_SERVICE_TOKEN', '');

        // Avoid a footgun in non-local environments.
        if ($expected === '') {
            if (app()->environment('local', 'testing')) {
                return $next($request);
            }

            return response()->json([
                'success' => false,
                'message' => 'Service misconfigured: INTERNAL_SERVICE_TOKEN not set.',
            ], 500);
        }

        $provided = (string) $request->header('X-Internal-Token', '');

        if ($provided === '' || !hash_equals($expected, $provided)) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden.',
            ], 403);
        }

        return $next($request);
    }
}
