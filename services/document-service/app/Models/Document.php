<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Document extends Model
{
    protected $fillable = [
        'form_data',
        'status',
        'output_path',
        'error_message',
    ];

    protected $casts = [
        'form_data' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}

