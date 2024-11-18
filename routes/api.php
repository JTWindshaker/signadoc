<?php

use App\Http\Controllers\PdfSignatureController;
use App\Http\Controllers\UserController;
use App\Http\Middleware\EnsureTokenIsValid;
use Illuminate\Support\Facades\Route;

/**
 * Rutas de la API para el manejo de usuarios y firma de PDF.
 *
 * Este archivo define las rutas disponibles para la autenticación y la firma de documentos PDF.
 * 
 * @package App\Http
 */

/**
 * Ruta para iniciar sesión
 * 
 * POST /auth
 * Solicitud: { "email": "user@example.com", "password": "yourpassword" }
 * Respuesta exitosa: 200 OK con el token de autenticación
 * Respuesta de error: 400 Bad Request si no se proporcionan criterios válidos
 * Respuesta de error: 401 Unauthorized si las credenciales son incorrectas
 */
Route::post('/auth', [UserController::class, 'auth'])
    ->name("auth");

// Agrupación de rutas protegidas por middleware de autenticación
Route::middleware(EnsureTokenIsValid::class)->group(function () {
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
    Route::post('/sign-pdf', [PdfSignatureController::class, 'signPdf'])
        ->name("sign-pdf");


    Route::post('/list-request', [PdfSignatureController::class, 'listRequests'])
        ->name("api.list-request");
});
