<?php

namespace App\Http\Controllers\api;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\LogService;
use App\Services\PdfSignerService;
use App\Services\ResponseService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Passport\Token;
use SimpleSoftwareIO\QrCode\Facades\QrCode;
use SetaPDF_Signer_X509_Certificate as Certificate;
use SetaPDF_Signer_Pem as Pem;
use SetaPDF_Signer_X509_Collection as Collection;
use SetaPDF_Signer_ValidationRelatedInfo_Collector as Collector;
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

    public function listRequests()
    {
        $solicitudes = DB::table('solicitud')
            ->select(
                'solicitud.id',
                'solicitud.users_email',
                'solicitud.estado',
                'solicitud.fecha_registro',
                'tipo_firma_id',
            )->join('solicitud_campo', 'solicitud_campo.solicitud_id', '=', 'solicitud.id')
            ->orderBy('solicitud.id')
            ->get();


        foreach ($solicitudes as $obj) {
            $obj->fecha_registro = date("Y-m-d H:i:s", strtotime($obj->fecha_registro));
        }

        return ApiResponse::success(
            $solicitudes,
            'Solicitudes cargadas correctamente'
        );
    }
}
