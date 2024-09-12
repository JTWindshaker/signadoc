<?php

namespace App\Http\Middleware;

use Closure;
use App\Helpers\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware para asegurar que el token de autenticación es válido.
 *
 * Este middleware verifica la validez del token de autenticación en las solicitudes.
 * Si el token es inválido o ha expirado, se devuelve una respuesta de error.
 * 
 * @package App\Http\Middleware
 */
class EnsureTokenIsValid
{
    /**
     * Maneja una solicitud entrante.
     *
     * Verifica si el token de autenticación es válido utilizando el guardia 'api'.
     * Si el token no es válido, devuelve una respuesta de error con código 401.
     * 
     * @param  \Illuminate\Http\Request  $request  La solicitud entrante que se está procesando.
     * @param  \Closure  $next  La siguiente acción en la cadena de middleware.
     * @return \Symfony\Component\HttpFoundation\Response  La respuesta generada por el middleware o la siguiente acción.
     */
    public function handle(Request $request, Closure $next): Response
    {
        // Verifica si el token de autenticación es válido
        if (!Auth::guard('api')->check()) {
            // Si la autenticación falla, usa el helper para devolver una respuesta de error
            return ApiResponse::error(
                'The token provided is invalid or expired. Please provide a valid token and try again.',
                401
            );
        }

        // Continúa con la solicitud si el token es válido
        return $next($request);
    }
}
