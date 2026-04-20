<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Document extends Model
{
    protected $fillable = [
        'form_data',
        'status',
        'output_path',
        'error_message',
        'public_id',
        'user_id',
    ];

    protected $casts = [
        'form_data' => 'array',
    ];

    protected static function booted()
    {
        static::creating(function (Document $doc) {
            $doc->public_id ??= (string) Str::ulid(); // or Str::uuid()
        });
    }

    // route model binding will use public_id instead of id
    public function getRouteKeyName()
    {
        return 'public_id';
    }
}