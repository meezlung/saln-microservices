<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\VerificationCodeMail;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class AuthController extends Controller
{
    public function mailTest(Request $request): JsonResponse
    {
        if (!(app()->environment('local') && config('app.debug'))) {
            return response()->json([
                'success' => false,
                'message' => 'Mail test endpoint is disabled outside local debug mode.',
            ], 403);
        }

        $validated = $request->validate([
            'email' => 'required|email',
        ]);

        try {
            Mail::to($validated['email'])->send(new VerificationCodeMail('123456', 15));

            return response()->json([
                'success' => true,
                'message' => 'Mail test sent successfully.',
                'to' => $validated['email'],
            ]);
        } catch (\Throwable $e) {
            Log::error('Mail test failed.', [
                'email' => $validated['email'],
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Mail test failed.',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    public function sendCode(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
        ]);

        $email = strtolower(trim($validated['email']));

        $expiresInMinutes = 15;
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        DB::table('verification_codes')->insert([
            'email' => $email,
            'code' => $code,
            'expires_at' => now()->addMinutes($expiresInMinutes),
            'used' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        try {
            Mail::to($email)->send(new VerificationCodeMail($code, $expiresInMinutes));
        } catch (\Throwable $e) {
            Log::error('Failed to send verification code email.', [
                'email' => $email,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Unable to send verification email.',
                'error' => $e->getMessage(),
            ], 500);
        }

        if (config('app.debug')) {
            Log::info("Verification code for {$email}: {$code}");
        }

        return response()->json([
            'success' => true,
            'message' => 'Verification code sent to your email.',
            'dev_code' => config('app.debug') ? $code : null,
        ]);
    }

    public function verifyLogin(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => 'required|email',
            'code' => 'required|string|size:6',
        ]);

        $email = strtolower(trim($validated['email']));

        $verification = DB::table('verification_codes')
            ->where('email', $email)
            ->where('code', $validated['code'])
            ->where('used', false)
            ->where('expires_at', '>', now())
            ->orderByDesc('id')
            ->first();

        if (!$verification) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid or expired verification code.',
            ], 422);
        }

        DB::table('verification_codes')
            ->where('id', $verification->id)
            ->update([
                'used' => true,
                'updated_at' => now(),
            ]);

        $user = User::where('email', $email)->first();
        $inactivityNotice = false;

        if ($user) {
            if ($user->last_activity_at && $user->last_activity_at->lt(now()->subDays(5))) {
                $inactivityNotice = true;
                $this->requestFormPurge($user->id);
                $this->requestDocumentPurge($user->id);
            }

            $user->last_activity_at = now();
            $user->save();
        } else {
            $user = User::create([
                'name' => explode('@', $email)[0],
                'email' => $email,
                'last_activity_at' => now(),
            ]);
        }

        // Keep a single active session token for this user.
        $user->tokens()->delete();

        $token = $user->createToken('saln-web', ['*'], now()->addHour())->plainTextToken;

        return response()->json([
            'success' => true,
            'message' => 'Login successful.',
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ],
            'inactivity_notice' => $inactivityNotice,
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'user' => $request->user(),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user && $user->currentAccessToken()) {
            $user->currentAccessToken()->delete();
        }

        return response()->json([
            'success' => true,
            'message' => 'Logged out successfully.',
        ]);
    }

    private function requestFormPurge(string $userId): void
    {
        $formServiceUrl = rtrim((string) env('FORM_SERVICE_URL', 'http://127.0.0.1:8002'), '/');

        try {
            Http::timeout(3)->post("{$formServiceUrl}/api/forms/purge", [
                'user_id' => $userId,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Could not purge forms after inactivity.', [
                'user_id' => $userId,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function requestDocumentPurge(string $userId): void
    {
        $documentServiceUrl = rtrim((string) env('DOCUMENT_SERVICE_URL', 'http://127.0.0.1:8003'), '/');

        try {
            Http::timeout(3)->post("{$documentServiceUrl}/api/documents/purge", [
                'user_id' => $userId,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Could not purge documents after inactivity.', [
                'user_id' => $userId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
