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

// In Lambda, add the bundled bin/ directory to PATH so pdftk binary is found
if (getenv('LAMBDA_TASK_ROOT') !== false) {
    $binDir = __DIR__ . '/../bin';
    putenv('PATH=' . $binDir . ':' . (getenv('PATH') ?: '/usr/local/bin:/usr/bin:/bin'));
}

// Strip CloudFront path prefix when running in Lambda (LAMBDA_PATH_PREFIX=/api/documents)
$_lambdaPrefix = getenv('LAMBDA_PATH_PREFIX');
if ($_lambdaPrefix !== false && $_lambdaPrefix !== '' && isset($_SERVER['REQUEST_URI'])) {
    $uri = $_SERVER['REQUEST_URI'];
    if (str_starts_with($uri, $_lambdaPrefix)) {
        $_SERVER['REQUEST_URI'] = substr($uri, strlen($_lambdaPrefix)) ?: '/';
    }
}
unset($_lambdaPrefix, $uri);

// Bootstrap Laravel and handle the request...
/** @var Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';

$app->handleRequest(Request::capture());
