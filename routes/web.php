<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\PdfSignatureController;
use Illuminate\Support\Facades\Route;

Route::get('/login', [AuthController::class, 'showLoginForm'])->name('login.showLoginForm');
Route::post('/login', [AuthController::class, 'authenticate'])->name('login.authenticate');

Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

Route::middleware(['auth'])->group(function () {
    Route::get('/dashboard', function () {
        return view('dashboard');
    })->name('dashboard');


    /**
     * Ruta para firmar un PDF.
     * 
     * POST /sign-pdf
     * Solicitud: { 
     *   "base64PDF": "string", 
     *   "base64P12": "string", 
     *   "passP12": "string", 
     *   "withStamp": 0/1, 
     *   "urlStamp": "string (opcional)", 
     *   "userStamp": "string (opcional)", 
     *   "passStamp": "string (opcional)", 
     *   "visibleSign": 0/1/2, 
     *   "imgSign": "string (opcional)", 
     *   "posSign": "string (opcional)", 
     *   "graphicSign": 0/1 (opcional), 
     *   "base64GraphicSign": "string (opcional)", 
     *   "backgroundSign": "string (opcional)", 
     *   "reasonSign": "string (opcional)", 
     *   "locationSign": "string (opcional)", 
     *   "infoQR": "string (opcional)", 
     *   "txtQR": "string (opcional)"
     * }
     * Respuesta exitosa: 200 OK con la información del PDF firmado
     * Respuesta de error: 400 Bad Request si no se proporcionan todos los datos obligatorios o si los parámetros no son válidos
     * Respuesta de error: 401 Unauthorized si las credenciales son incorrectas
     */
    Route::post('/sign', [PdfSignatureController::class, 'signPdf'])->name("sign");

    Route::get('/request', [PdfSignatureController::class, 'requestView'])->name('request');
    Route::post('/list-request', [PdfSignatureController::class, 'listRequests'])->name('list-request');
});
