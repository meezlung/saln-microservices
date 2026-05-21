<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require __DIR__.'/../vendor/autoload.php';

// In Lambda /var/task is read-only; create writable storage dirs in /tmp
if (getenv('LAMBDA_TASK_ROOT') !== false) {
    foreach (['/tmp/laravel/framework/cache/data', '/tmp/laravel/framework/sessions',
              '/tmp/laravel/framework/views', '/tmp/laravel/app', '/tmp/laravel/logs'] as $_dir) {
        if (!is_dir($_dir)) {
            mkdir($_dir, 0755, true);
        }
    }
    putenv('APP_STORAGE_PATH=/tmp/laravel');
    $_ENV['APP_STORAGE_PATH'] = '/tmp/laravel';
}
unset($_dir);

// Rewrite CloudFront path prefix when running in Lambda
// e.g. LAMBDA_PATH_PREFIX=/api/auth + LAMBDA_PATH_REPLACE=/api rewrites /api/auth/send-code → /api/send-code
$_lambdaPrefix = getenv('LAMBDA_PATH_PREFIX');
if ($_lambdaPrefix !== false && $_lambdaPrefix !== '' && isset($_SERVER['REQUEST_URI'])) {
    $uri = $_SERVER['REQUEST_URI'];
    if (str_starts_with($uri, $_lambdaPrefix)) {
        $_lambdaReplace = getenv('LAMBDA_PATH_REPLACE');
        $_lambdaReplace = ($_lambdaReplace !== false) ? $_lambdaReplace : '';
        $remainder = substr($uri, strlen($_lambdaPrefix));
        $_SERVER['REQUEST_URI'] = ($_lambdaReplace . $remainder) ?: '/';
    }
}
unset($_lambdaPrefix, $_lambdaReplace, $uri, $remainder);

// Bootstrap Laravel and handle the request...
/** @var Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';

$app->handleRequest(Request::capture());
