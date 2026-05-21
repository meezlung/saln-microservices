<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class AuthServiceIntrospection
{
    public function handle(Request $request, Closure $next): Response
    {
        $authorization = $request->header('Authorization');

        if (!is_string($authorization) || !str_starts_with($authorization, 'Bearer ')) {
            return response()->json([
                'success' => false,
                'message' => 'Missing Bearer token.',
            ], 401);
        }

        $meUrl = (string) env('AUTH_SERVICE_ME_URL', '');
        $authServiceUrl = rtrim((string) env('AUTH_SERVICE_URL', 'http://127.0.0.1:8001'), '/');
        $targetUrl = $meUrl !== '' ? $meUrl : "{$authServiceUrl}/api/me";

        try {
            $resp = Http::timeout(3)
                ->withHeaders(['Authorization' => $authorization])
                ->get($targetUrl);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Auth service unreachable.',
            ], 503);
        }

        if (!$resp->ok()) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized.',
            ], 401);
        }

        $userId = data_get($resp->json(), 'user.id');

        if (!is_string($userId) || !Str::isUuid($userId)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized.',
            ], 401);
        }

        // Canonical user identity for this request.
        $request->attributes->set('auth_user_id', $userId);

        // Back-compat with existing controllers that read X-User-Id.
        $request->headers->set('X-User-Id', $userId);

        return $next($request);
    }
}
