<?php

namespace App\Services;

use Illuminate\Http\JsonResponse;

class ResponseService
{
    /**
     * Genera una respuesta de éxito.
     *
     * @param array $data Datos opcionales a incluir en la respuesta.
     * @param string $message Mensaje opcional a incluir en la respuesta.
     * 
     * @return JsonResponse Respuesta JSON con el estado de éxito.
     */
    public function success($data = [], $message = 'The request has been processed successfully'): JsonResponse
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
     * @return JsonResponse Respuesta JSON con el estado de error.
     */
    public function error($message = 'There was an error processing the request', $code = 400, $errors = null): JsonResponse
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
     * @return JsonResponse Respuesta JSON con el estado de error 404.
     */
    public function notFound($message = 'Resource not found'): JsonResponse
    {
        return $this->error($message, 404);
    }
}
