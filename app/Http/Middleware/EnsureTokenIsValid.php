<?php

namespace App\Http\Middleware;

use App\Services\ResponseService;
use Closure;
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
    protected $responseService;

    /**
     * Instantiate a new controller instance.
     *
     * @return void
     */
    public function __construct(
        ResponseService $responseService
    ) {
        $this->responseService = $responseService;
    }

    /**
     * Maneja una solicitud entrante.
     *
     * Verifica si el token es válido y asocia el usuario autenticado al Request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure  $next
     * @return \Symfony\Component\HttpFoundation\Response
     */
    public function handle(Request $request, Closure $next): Response
    {
        // Verifica si el token de autenticación es válido
        $guard = Auth::guard('api');
        if (!$guard->check()) {
            // Si la autenticación falla, devuelve una respuesta de error
            return $this->responseService->error(
                'The token provided is invalid or expired. Please provide a valid token and try again.',
                401
            );
        }

        // Asocia el usuario autenticado al Request
        $request->setUserResolver(function () use ($guard) {
            return $guard->user();
        });

        // Continúa con la solicitud si el token es válido
        return $next($request);
    }
}
