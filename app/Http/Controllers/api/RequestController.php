<?php

namespace App\Http\Controllers\api;

use App\Http\Controllers\Controller;
use App\Services\ResponseService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RequestController extends Controller
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

    public function listRequests(Request $request)
    {
        $user = $request->user();

        $solicitudes = DB::table('solicitud')
            ->select(
                'solicitud.id',
                'solicitud.users_email',
                'solicitud.estado',
                'solicitud.fecha_registro',
                'tipo_firma_id',
            )->join('solicitud_campo', 'solicitud_campo.solicitud_id', '=', 'solicitud.id')
            ->where("solicitud.users_email", $user->email)
            ->orderBy('solicitud.id')
            ->get();


        foreach ($solicitudes as $obj) {
            $obj->fecha_registro = date("Y-m-d H:i:s", strtotime($obj->fecha_registro));
        }

        return $this->responseService->success(
            $solicitudes,
            'Solicitudes cargadas correctamente'
        );
    }

    public function fieldsRequest(Request $request, $idRequest)
    {
        $user = $request->user();

        $solicitud = DB::table('solicitud')
            ->select(
                'solicitud.hash_documento',
                'solicitud.users_email',
                'solicitud.estado',
                'solicitud.fecha_registro',
                'tipo_firma_id',
                'solicitud_campo.*'
            )->join('solicitud_campo', 'solicitud_campo.solicitud_id', '=', 'solicitud.id')
            ->where([
                ["solicitud.id", $idRequest],
                ["solicitud.users_email", $user->email],
            ])->first();

        if ($solicitud) {
            $solicitud->fecha_registro = date("Y-m-d H:i:s", strtotime($solicitud->fecha_registro));
        } else {
            return $this->responseService->error(
                $solicitud,
                204,
                'La solicitud no pertenece al usuario'
            );
        }

        return $this->responseService->success(
            $solicitud,
            'Solicitud cargada correctamente'
        );
    }
}
