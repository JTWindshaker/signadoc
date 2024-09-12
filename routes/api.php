<?php

use App\Http\Controllers\PdfSignatureController;
use App\Http\Controllers\UserController;
use App\Http\Middleware\EnsureTokenIsValid;
use Illuminate\Support\Facades\Route;

Route::post('/auth', [UserController::class, 'auth'])
    ->name("auth");

Route::middleware(EnsureTokenIsValid::class)->group(function () {
    Route::post('/sign-pdf', [PdfSignatureController::class, 'signPdf'])
        ->name("sign-pdf");
});
