<?php

namespace App\Http\Controllers;

use App\Services\LogService;
use App\Services\PdfSignerService;
use App\Services\ResponseService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

class PdfSignatureController extends Controller
{
    protected $responseService;
    protected $pdfSignerService;

    /**
     * Instantiate a new controller instance.
     *
     * @return void
     */
    public function __construct(
        ResponseService $responseService,
        PdfSignerService $pdfSignerService,
    ) {
        $this->responseService = $responseService;
        $this->pdfSignerService = $pdfSignerService;
    }

    /**
     * Maneja la firma de documentos PDF.
     *
     * @param Request $request La solicitud HTTP que contiene los datos para crear la firma en un documento.
     * @return \Illuminate\Http\JsonResponse La respuesta JSON con la información de la firma.
     */
    public function signPdf(Request $request)
    {
        $logService = new LogService('sign_doc');
        $logService->log("Proceso iniciado", true);

        return $this->pdfSignerService->signPdf($request, $logService, $this->responseService);
    }

    public function requestView()
    {
        return view('request');
    }

    public function listRequests()
    {
        $solicitudes = DB::table('solicitud')
            ->join('solicitud_campo', 'solicitud_campo.solicitud_id', '=', 'solicitud.id')
            ->get(); // Obtén todos los registros de la tabla 'solicitud'

        return $this->responseService->success($solicitudes); // Retorna los datos en formato JSON
    }
}
