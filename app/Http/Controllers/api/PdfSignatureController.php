<?php

namespace App\Http\Controllers\api;

use App\Http\Controllers\Controller;
use App\Services\LogService;
use App\Services\PdfSignerService;
use App\Services\ResponseService;
use Illuminate\Http\Request;

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
     * Maneja la firma de documentos PDF desde el API.
     *
     * @param Request $request La solicitud HTTP que contiene los datos para crear la firma en un documento.
     * @return \Illuminate\Http\JsonResponse La respuesta JSON con la información de la firma.
     */
    public function signPdf(Request $request)
    {
        $logService = new LogService('sign_doc_api');
        $logService->log("Proceso iniciado", true);

        return $this->pdfSignerService->signPdf($request, $logService, $this->responseService);
    }
}
