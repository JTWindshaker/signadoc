<?php

namespace App\Http\Controllers;

use App\Helpers\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Throwable;

class UserController extends Controller
{
    // Definición de constantes
    public const CODE_ERROR_NO_CORRECT_DATA = 6;

    /**
     * Crear una nueva instancia del controlador.
     *
     * @return void
     */
    public function __construct() {}

    public function auth(Request $request): JsonResponse
    {
        try {
            // Validar los datos de entrada
            $request->validate([
                'email' => 'required|string',
                'password' => 'required|string',
            ]);

            // Hacer una solicitud para obtener el token de acceso utilizando el flujo de autenticación de contraseña
            $response = Http::asForm()
                ->withHeaders([
                    'Origin' => config("app.url"), // Reemplaza con el origen permitido
                    'Access-Control-Allow-Origin' => config("app.url"), // Reemplaza con el origen permitido
                    'Access-Control-Allow-Methods' => 'POST, GET, OPTIONS, PUT, DELETE', // Métodos permitidos
                    'Access-Control-Allow-Headers' => 'Content-Type, Accept, Authorization, X-Requested-With', // Encabezados permitidos
                    'Access-Control-Allow-Credentials' => 'true', // Permitir credenciales de cookies
                ])
                ->post(config("app.url") . '/oauth/token', [
                    'grant_type' => 'password',
                    'client_id' => config("app.client_id"),
                    'client_secret' => config("app.client_secret"),
                    'username' => $request->email,
                    'password' => $request->password,
                    'scope' => '*',
                ]);
        } catch (Throwable $th) {
            // Manejo de errores en la solicitud
            return ApiResponse::error('Validation failed', 400, $th->errors());
        }

        // Verificar si la solicitud fue exitosa
        if ($response->successful()) {
            // Retornar los datos de la respuesta (incluyendo el token de acceso) en la respuesta del controlador
            return ApiResponse::success(
                $response->json(),
                'Login successful'
            );
        } else {
            // Si la solicitud no fue exitosa, retornar un mensaje de error
            return ApiResponse::error('Invalid email or password', 401);
        }
    }
}
