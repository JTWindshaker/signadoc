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
        $request->urlStamp = ($request->urlStamp === null ? "" : $request->urlStamp);
        
        try {
            // Validar los datos de entrada
            $request->validate([
                'base64PDF' => 'required|string',
                'base64P12' => 'required|string',
                'passP12' => 'required|string',
                'withStamp' => 'required|boolean',
                'urlStamp' => [
                    function ($attribute, $value, $fail) use ($request) {
                        if ($request->input('withStamp') == 1) {
                            if (empty($value) || $value == null) {
                                $fail($attribute . ' is required when withStamp is 1.');
                                return;
                            }

                            if (!preg_match('/^(https?:\/\/)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,6})(:[0-9]{1,5})?(\/.*)?$/', $value)) {
                                $fail('The format of ' . $attribute . ' is invalid. Please provide a valid URL.');
                            }
                        }
                    },
                ],
                'userStamp' => 'nullable|string',
                'passStamp' => 'nullable|string',
                'visibleSign' => 'required|integer|in:1,2,3',
                'imgSign' => 'nullable|string',
                'posSign' => [
                    function ($attribute, $value, $fail) use ($request) {
                        if (in_array($request->input('visibleSign'), [2, 3]) && empty($value)) {
                            $fail($attribute . ' is required when visibleSign is 2 or 3.');
                        } elseif (in_array($request->input('visibleSign'), [2, 3]) && !empty($value) && !preg_match('/^\d+,\d+,\d+,\d+,\d+$/', $value)) {
                            $fail('The format of ' . $attribute . ' is invalid. It must be pag,x,y,width,height.');
                        }
                    },
                ],
                'graphicSign' => [
                    'nullable',
                    'boolean',
                    function ($attribute, $value, $fail) use ($request) {
                        if ($request->input('visibleSign') == 3 && $value === null) {
                            $fail($attribute . ' is required when visibleSign is 3.');
                        }
                    },
                ],
                'base64GraphicSign' => [
                    function ($attribute, $value, $fail) use ($request) {
                        if ($request->input('graphicSign') && $request->input('visibleSign') == 3 && (empty($value) || $value == "null")) {
                            $fail($attribute . ' is required when graphicSign is true and visibleSign is 3.');
                        }
                    },
                ],
                'backgroundSign' => 'nullable|string',
                'reasonSign' => 'nullable|string',
                'locationSign' => 'nullable|string',
                'infoQR' => [
                    function ($attribute, $value, $fail) use ($request) {
                        if (!empty($request->input('txtQR')) && empty($value)) {
                            $fail($attribute . ' is required when txtQR is not null or empty.');
                        } elseif (!empty($value) && !preg_match('/^\d+,\d+,\d+,\d+$/', $value)) {
                            $fail('The format of ' . $attribute . ' is invalid. It must be pag,x,y,size.');
                        }
                    },
                ],
                'txtQR' => [
                    function ($attribute, $value, $fail) use ($request) {
                        if (!empty($request->input('infoQR')) && empty($value)) {
                            $fail($attribute . ' is required when infoQR is not null or empty.');
                        }
                    },
                ]
            ]);
        } catch (Throwable $th) {
            // Retornar error en caso de falla en la validación
            foreach ($th->errors() as $obj => $value) {
                $logService->log("$obj = " . implode(", ", $value));
            }

            return $this->responseService->error('Validation failed', 400, $th->errors());
        }

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
