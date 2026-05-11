<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function showLogin()
    {
        return view('auth.login');
    }

    public function sendCode(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        
        DB::table('verification_codes')->insert([
            'email' => $request->email,
            'code' => $code,
            'expires_at' => now()->addMinutes(15),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // In production, send email with code
        // For development, you can log it
        \Log::info("Verification code for {$request->email}: {$code}");

        return response()->json([
            'success' => true,
            'message' => 'Verification code sent to your email.',
            'dev_code' => config('app.debug') ? $code : null, // Only in debug mode
        ]);
    }

    public function verifyAndLogin(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'code' => 'required|string|size:6',
        ]);

        $verification = DB::table('verification_codes')
            ->where('email', $request->email)
            ->where('code', $request->code)
            ->where('used', false)
            ->where('expires_at', '>', now())
            ->first();

        if (!$verification) {
            return back()->withErrors([
                'code' => 'Invalid or expired verification code.',
            ]);
        }

        // Mark code as used
        DB::table('verification_codes')
            ->where('id', $verification->id)
            ->update(['used' => true]);

        // Check if user exists
        $user = User::where('email', $request->email)->first();
        
        $wasInactive = false;
        
        if ($user) {
            // Check if user was inactive for more than 5 days
            if ($user->last_activity_at && $user->last_activity_at->lt(now()->subDays(5))) {
                $wasInactive = true;
                // Delete all user's form data
                $user->forms()->delete();
            }
            
            $user->last_activity_at = now();
            $user->save();
        } else {
            // Create new user
            $user = User::create([
                'name' => explode('@', $request->email)[0],
                'email' => $request->email,
                'last_activity_at' => now(),
            ]);
        }

        Auth::login($user);

        if ($wasInactive) {
            return redirect()->route('dashboard')->with('inactivity_notice', true);
        }

        return redirect()->route('dashboard');
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        
        return redirect('/');
    }
}
