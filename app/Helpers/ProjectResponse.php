<?php

namespace App\Helpers;

/**
 * Clase de ayuda para generar respuestas API uniformes.
 *
 * Proporciona métodos para generar respuestas consistentes para solicitudes exitosas y fallidas.
 * 
 * @package App\Helpers
 */
class ProjectResponse
{
    /**
     * Genera una respuesta de éxito.
     *
     * @param array $data Datos opcionales a incluir en la respuesta.
     * @param string $message Mensaje opcional a incluir en la respuesta.
     * 
     * @return \Illuminate\Http\JsonResponse Respuesta JSON con el estado de éxito.
     */
    public static function success($data = [], $message = 'The request has been processed successfully')
    {
        return response()->json([
            'status' => 'success',
            'success' => true,
            'code' => 200,
            'data' => $data,
            'message' => $message
        ]);
    }

    /**
     * Genera una respuesta de error.
     *
     * @param string $message Mensaje opcional a incluir en la respuesta de error.
     * @param int $code Código de estado HTTP para la respuesta de error.
     * @param array|null $errors Errores adicionales a incluir en la respuesta.
     * 
     * @return \Illuminate\Http\JsonResponse Respuesta JSON con el estado de error.
     */
    public static function error($message = 'There was an error processing the request', $code = 400, $errors = null)
    {
        return response()->json([
            'status' => 'error',
            'success' => false,
            'code' => $code,
            'data' => null,
            'message' => $message,
            'errors' => $errors
        ]);
    }

    /**
     * Genera una respuesta de error con un código de estado 404.
     *
     * @param string $message Mensaje opcional a incluir en la respuesta de error.
     * 
     * @return \Illuminate\Http\JsonResponse Respuesta JSON con el estado de error 404.
     */
    public static function notFound($message = 'Resource not found')
    {
        return self::error($message, 404);
    }
}
