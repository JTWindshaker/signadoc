<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\PdfSignatureController;
use App\Http\Controllers\TemplateController;
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
     *   "levelCertification": 0/1/2/3,
     *   "withStamp": 0/1, 
     *   "urlStamp": "string (opcional)", 
     *   "userStamp": "string (opcional)", 
     *   "passStamp": "string (opcional)", 
     *   "visibleSign": 1/2/3,
     *   "withText": 0/1, 
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

    /* Solicitudes */
    Route::get('/request', [PdfSignatureController::class, 'requestView'])->name('request');
    Route::post('/list-request', [PdfSignatureController::class, 'listRequests'])->name('list-request');

    /* Plantillas */
    Route::get('/template', [TemplateController::class, 'templateView'])->name('template');
    Route::post('/template/list-templates', [TemplateController::class, 'listTemplates'])->name('list-templates');
    Route::post('/template/create', [TemplateController::class, 'templateCreate'])->name('template.create');
    Route::post('/template/delete', [TemplateController::class, 'templateDelete'])->name('template.delete');

    // Editar Plantillas
    Route::get('/edit-template/{id}', [TemplateController::class, 'editTemplateView'])->name('edit-template');
    Route::post('/edit-template/list-fields', [TemplateController::class, 'listFields'])->name('list-fields');
    Route::post('/edit-template/load-template', [TemplateController::class, 'loadTemplate'])->name('load-template');
    Route::post('/edit-template/save-template', [TemplateController::class, 'saveTemplate'])->name('save-template');

    // Llenado Plantillas
    Route::get('/fill-template/{id}', [TemplateController::class, 'fillTemplateView'])->name('fill-template');
    Route::post('/fill-template/load-template', [TemplateController::class, 'fillLoadTemplate'])->name('fill-load-template');
    Route::post('/fill-template/save-template', [TemplateController::class, 'fillSaveTemplate'])->name('fill-save-template');
});
