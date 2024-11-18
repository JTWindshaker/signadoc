<?php

namespace App\Http\Controllers;

use App\Helpers\ProjectResponse;
use App\Models\Solicitud;
use App\Models\SolicitudCampo;
use App\Models\TipoFirma;
use App\Services\LogService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use SimpleSoftwareIO\QrCode\Facades\QrCode;
use SetaPDF_Signer_X509_Certificate as Certificate;
use SetaPDF_Signer_Pem as Pem;
use SetaPDF_Signer_X509_Collection as Collection;
use SetaPDF_Signer_ValidationRelatedInfo_Collector as Collector;
use Throwable;

class RequestController extends Controller
{

    /**
     * Instantiate a new controller instance.
     *
     * @return void
     */
    public function __construct()
    {
        /*  */
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

        $request->urlStamp = ($request->urlStamp === null ? "" : $request->urlStamp);
        //PENDIENTE: TODOS LOS VALORES FIJOS, CAMBIARLOS POR VARIABLES PARA DINAMIZAR EL CÓDIGO
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
                    'nullable',
                    'string',
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
                    'nullable',
                    'string',
                    function ($attribute, $value, $fail) use ($request) {
                        if ($request->input('graphicSign') && $request->input('visibleSign') == 3 && (empty($value) || $value == "null")) {
                            // dd($value);
                            // dd((empty($value) || $value == "null"), empty($value), $value == "null", $value);
                            $fail($attribute . ' is required when graphicSign is true and visibleSign is 3.');
                        }
                    },
                ],
                'backgroundSign' => 'nullable|string',
                'reasonSign' => 'nullable|string',
                'locationSign' => 'nullable|string',
                'infoQR' => [
                    'nullable',
                    'string',
                    function ($attribute, $value, $fail) use ($request) {
                        if (!empty($request->input('txtQR')) && empty($value)) {
                            $fail($attribute . ' is required when txtQR is not null or empty.');
                        } elseif (!empty($value) && !preg_match('/^\d+,\d+,\d+,\d+$/', $value)) {
                            $fail('The format of ' . $attribute . ' is invalid. It must be pag,x,y,size.');
                        }
                    },
                ],
                'txtQR' => [
                    'nullable',
                    'string',
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

            return ProjectResponse::error('Validation failed', 400, $th->errors());
        }

        // Obtener los datos de entrada
        $base64PDF = $request->base64PDF;
        $base64P12 = $request->base64P12;
        $passP12 = $request->passP12;
        $withStamp = $request->withStamp == 1;
        $urlStamp = $request->urlStamp;
        $userStamp = $request->userStamp;
        $passStamp = $request->passStamp;
        $visibleSign = (int) $request->visibleSign;
        $imgSign = ($request->imgSign == "null" ? null : $request->imgSign);
        $posSign = $request->posSign;
        $graphicSign = $request->graphicSign == 1;
        $base64GraphicSign = ($request->base64GraphicSign == "null" ? null : $request->base64GraphicSign);
        $backgroundSign = ($request->backgroundSign == "null" ? null : $request->backgroundSign);
        $reasonSign = $request->reasonSign;
        $locationSign = $request->locationSign;
        $txtQR = $request->txtQR;
        $infoQR = $request->infoQR;
        $qrData = null;
        $imgData = null;
        $bgData = null;
        $graphData = null;

        $defaultPosSign = \SetaPDF_Signer_SignatureField::POSITION_LEFT_BOTTOM;

        // Array para almacenar documentos
        $arrDocs = array();

        // Decodificar datos base64
        $pdfData = base64_decode($base64PDF);
        $p12Data = base64_decode($base64P12);

        // Crear un timestamp único
        $timestamp = Carbon::now()->format('YmdHis') . '' . Carbon::now()->microsecond;

        // Nombres de archivo
        $pdfFilename = 'pdf_' . $timestamp . '.pdf';
        $p12Filename = 'p12_' . $timestamp . '.p12';

        // Almacenar archivos en disco local
        Storage::disk('local')->put("/public/" . $pdfFilename, $pdfData);
        Storage::disk('local')->put("/public/certificates/" . $p12Filename, $p12Data);
        $arrDocs[] = "/public/" . $pdfFilename;
        $arrDocs[] = "/public/certificates/" . $p12Filename;

        // Cargar documento PDF
        $writer = new \SetaPDF_Core_Writer_String();
        $document = \SetaPDF_Core_Document::loadByFilename(public_path('storage/' . $pdfFilename), $writer);
        $lastPage = $document->getCatalog()->getPages()->count();
        $width = $document->getCatalog()->getPages()->getPage($lastPage)->getWidth();
        $height = $document->getCatalog()->getPages()->getPage($lastPage)->getHeight();

        // Manejo de código QR
        if ($txtQR !== null && $txtQR !== "" && $infoQR !== null && $infoQR !== "") {
            list($pagQR, $xQR, $yQR, $sizeQR) = explode(',', $infoQR);

            $pagQR = (int) $pagQR;
            $xQR = (int) $xQR;
            $yQR = (int) $yQR;
            $sizeQR = (int) $sizeQR;
            // L: 7%, M: 15%, Q: 25%, H: 30%
            $correccionQR = "L";
            $typeQR = "png";

            // Validar que la página existe
            if ($pagQR > $lastPage) {
                $logService->log("Page $pagQR dont exist in document.");
                return ProjectResponse::error("Page $pagQR dont exist in document.", 400);
            }

            // Generar imagen QR
            $image = QrCode::format($typeQR)
                ->size($sizeQR)
                ->style('round')
                ->errorCorrection($correccionQR)
                ->generate($txtQR);

            $qrBase64 = base64_encode($image);
            $qrData = base64_decode($qrBase64);
            $qrFilename = 'qr_' . $timestamp . ".$typeQR";

            // Almacenar imagen QR en disco
            Storage::disk('local')->put("/public/qrs/" . $qrFilename, $qrData);
            $arrDocs[] = "/public/qrs/" . $qrFilename;

            // Dibujar imagen QR en el PDF
            $image = \SetaPDF_Core_Image::getByPath(public_path('storage/qrs/' . $qrFilename))->toXObject($document);
            $canvas = $document->getCatalog()->getPages()->getPage($pagQR)->getCanvas();
            $image->draw($canvas, $xQR, $yQR, $sizeQR, $sizeQR);
        }
        // Fin manejo de QR

        // Inicializar el firmador
        $signer = new \SetaPDF_Signer($document);
        // $signer->setSignatureContentLength(26000);
        $signer->setSignatureContentLength(80000);

        // Ruta del archivo P12
        $certPath = public_path('storage/certificates/' . $p12Filename);
        $certContent = file_get_contents($certPath);

        // Verificar contenido del certificado
        if (!$certContent) {
            $this->deleteFiles($arrDocs);
            $logService->log("Invalid certificate content");
            return ProjectResponse::error('Invalid certificate content', 400, $th->errors());
        }

        // Proceso para leer el certificado P12
        $pkcs12 = [];
        if (pathinfo($certPath, PATHINFO_EXTENSION) === 'p12') {
            if (!openssl_pkcs12_read($certContent, $pkcs12, $passP12)) {
                $this->deleteFiles($arrDocs);
                $logService->log("No se pudo leer el certificado PKCS#12. Verifica la contraseña.");
                return ProjectResponse::error('No se pudo leer el certificado PKCS#12. Verifica la contraseña.', 400);
            }
            $certContent = $pkcs12['cert'];
            $privateKey = $pkcs12['pkey'];
        } else {
            $certContent = openssl_x509_read($certContent);
            $privateKey = openssl_pkey_get_private($certContent, $passP12);
        }

        // Verifica si se ha podido leer el contenido del certificado
        if (!$certContent) {
            $this->deleteFiles($arrDocs);
            $logService->log("No se pudo leer el certificado X.509.");
            return ProjectResponse::error('No se pudo leer el certificado X.509.', 400);
        }

        // Verifica si se ha podido leer la clave privada
        if (!$privateKey) {
            $this->deleteFiles($arrDocs);
            $logService->log("No se pudo leer la clave privada.");
            return ProjectResponse::error('No se pudo leer la clave privada.', 400);
        }

        // Crea un módulo de firma para PDF utilizando la clase SetaPDF_Signer_Signature_Module_Pades
        $module = new \SetaPDF_Signer_Signature_Module_Pades();
        $module->setCertificate($pkcs12['cert']);
        $module->setPrivateKey($pkcs12['pkey']);

        // Crea un objeto Certificate con el certificado leído
        $certificate = new Certificate($pkcs12['cert']);

        // Verifica si existen certificados adicionales y los agrega a la colección
        if (isset($pkcs12['extracerts']) && count($pkcs12['extracerts'])) {
            $trustedCertificates = new Collection($pkcs12['extracerts']);
            $collector = new Collector($trustedCertificates);
            $collector->getExtraCertificates()->add($pkcs12['extracerts']);
        } else {
            $collector = new Collector();
        }

        /* Fin del espacio para producción */

        try {
            // Obtiene información de validación relacionada con el certificado
            $vriData = $collector->getByCertificate($certificate);
            // Establece los certificados adicionales para el módulo
            $module->setExtraCertificates($vriData->getCertificates());
            // Agrega respuestas OCSP al módulo
            foreach ($vriData->getOcspResponses() as $ocspResponse) {
                $module->addOcspResponse($ocspResponse);
            }

            // Agrega CRLs al módulo
            foreach ($vriData->getCrls() as $crl) {
                $module->addCrl($crl);
            }
        } catch (\SetaPDF_Signer_ValidationRelatedInfo_Exception $th) {
            // Permite firmar pero sin LTV (Long-Term Validation)
        }

        // Configuración para la estampa de tiempo
        if ($withStamp) {
            // Datos para la estampa de tiempo
            $tsModule = new \SetaPDF_Signer_Timestamp_Module_Rfc3161_Curl($urlStamp);

            // Establece las opciones de autenticación si se proporcionan
            if (isset($userStamp)) {
                $tsModule->setCurlOption(\CURLOPT_USERPWD, $userStamp . ':' . $passStamp);
            }

            // Asigna el módulo de estampado de tiempo al firmador
            $signer->setTimestampModule($tsModule);
            // Fin Datos para la estampa de tiempo
        }

        // Configuración de la apariencia de la firma
        switch ($visibleSign) {
            case TipoFirma::TIPO_FIRMA_INVISIBLE:
                // Firma Invisible
                // Agrega un campo de firma con el doble de la altura del bloque de texto
                $field = $signer->addSignatureField(
                    $timestamp
                );

                // Establece el nombre del campo de firma
                $signer->setSignatureFieldName($field->getQualifiedName());

                break;
            case TipoFirma::TIPO_FIRMA_VISIBLE:
                // Dividir la cadena en partes
                list($page, $x, $y, $width, $height) = explode(',', $posSign);

                // Convertir los valores a enteros (si es necesario)
                $page = (int) $page;
                $x = (int) $x;
                $y = (int) $y;
                $width = (int) $width;
                $height = (int) $height;

                // Verifica si la página especificada existe
                if ($page > $lastPage) {
                    $logService->log("Page $page dont exist in document.");
                    return ProjectResponse::error("Page $page dont exist in document.", 400);
                }

                // Decodificar los datos de la imagen en base64
                if ($imgSign !== null && $imgSign !== "") {
                    $imgData = base64_decode($imgSign);

                    // Nombres de archivo
                    $imgFilename = 'seal_' . $timestamp . '.png';

                    // Guardar archivos usando Storage
                    Storage::disk('local')->put("/public/icons/" . $imgFilename, $imgData);
                    $arrDocs[] = "/public/icons/" . $imgFilename;

                    // Cargar la imagen
                    $image = \SetaPDF_Core_Image::getByPath(public_path('storage/icons/' . $imgFilename));
                    $imageXObject = $image->toXObject($document);

                    // Define el tamaño de la imagen
                    // $width = $imageXObject->getWidth();
                    // $height = $imageXObject->getHeight();
                    $xObject = \SetaPDF_Core_XObject_Form::create($document, [0, 0, $width, $height]);

                    // Dibuja la imagen en el canvas
                    $canvas = $xObject->getCanvas();
                    $imageXObject->draw($canvas, 0, 0, $width, $height);

                    // Crea una instancia de fuente
                    $font = new \SetaPDF_Core_Font_Type0_Subset($document, public_path('fonts/DejaVuSerif-Italic.ttf'));

                    // Crea un bloque de texto simple
                    $textBlock = new \SetaPDF_Core_Text_Block($font, 10);
                    $textBlock->setTextWidth($width - 70);
                    $textBlock->setLineHeight(11);
                    $textBlock->setPadding(5);

                    // Obtiene la información específica del certificado
                    if (!file_exists($certPath)) {
                        dd("Error: The file does not exist at path: $certPath");
                    }

                    if (!is_readable($certPath)) {
                        dd("Error: The file is not readable at path: $certPath");
                    }

                    $certificateInfo = openssl_x509_parse($certContent);
                    $text = "Firmado por:\n"
                        . (isset($certificateInfo['subject']['CN']) ? $certificateInfo['subject']['CN'] : $signer->getName()) . "\n"
                        . date('Y/m/d H:i:s');

                    $textBlock->setText($text);
                    $textBlock->draw($canvas, 0, $height / 2 - $textBlock->getHeight() / 2);

                    // Crea una instancia de apariencia XObject
                    $appearance = new \SetaPDF_Signer_Signature_Appearance_XObject($xObject);

                    // Agrega un campo de firma
                    $field = $signer->addSignatureField(
                        $timestamp,
                        $page,
                        $defaultPosSign,
                        ['x' => $x, 'y' => $y],
                        $width,
                        $height
                    );

                    // Establece el nombre del campo de firma
                    $signer->setSignatureFieldName($field->getQualifiedName());

                    // Asigna la apariencia al firmador
                    $signer->setAppearance($appearance);
                } else {
                    // Si no se proporciona imagen, crea un XObject vacío
                    $xObject = \SetaPDF_Core_XObject_Form::create($document, [0, 0, $width, $height]);

                    // Dibuja el canvas
                    $canvas = $xObject->getCanvas();

                    // Crea una instancia de fuente
                    $font = new \SetaPDF_Core_Font_Type0_Subset($document, public_path('fonts/DejaVuSerif-Italic.ttf'));

                    // Crea un bloque de texto simple
                    $textBlock = new \SetaPDF_Core_Text_Block($font, 10);
                    $textBlock->setTextWidth($width);
                    $textBlock->setLineHeight(11);
                    $textBlock->setPadding(5);

                    // Obtiene la información específica del certificado
                    $certificateInfo = openssl_x509_parse($certContent);
                    $text = "Firmado por:\n"
                        . (isset($certificateInfo['subject']['CN']) ? $certificateInfo['subject']['CN'] : $signer->getName()) . "\n"
                        . date('Y/m/d H:i:s');
                    $textBlock->setText($text);
                    $textBlock->draw($canvas, 0, $height / 2 - $textBlock->getHeight() / 2);

                    // Crea una instancia de apariencia XObject
                    $appearance = new \SetaPDF_Signer_Signature_Appearance_XObject($xObject);

                    // Agrega un campo de firma
                    $field = $signer->addSignatureField(
                        $timestamp,
                        $page,
                        $defaultPosSign,
                        ['x' => $x, 'y' => $y],
                        $width,
                        $height
                    );

                    // Establece el nombre del campo de firma
                    $signer->setSignatureFieldName($field->getQualifiedName());

                    // Asigna la apariencia al firmador
                    $signer->setAppearance($appearance);
                }
                break;
            case TipoFirma::TIPO_FIRMA_VISIBLE_DOS:
                // Dividir la cadena en partes
                list($page, $x, $y, $width, $height) = explode(',', $posSign);

                // Convertir los valores a enteros (si es necesario)
                $page = (int) $page;
                $x = (int) $x;
                $y = (int) $y;
                $width = (int) $width;
                $height = (int) $height;

                // Verifica si la página especificada existe
                if ($page > $lastPage) {
                    $logService->log("Page $page dont exist in document.");
                    return ProjectResponse::error("Page $page dont exist in document.", 400);
                }

                // Agrega un campo de firma
                $field = $signer->addSignatureField(
                    $timestamp,
                    $page,
                    $defaultPosSign,
                    ['x' => $x, 'y' => $y],
                    $width,
                    $height
                );

                // Establece el nombre del campo de firma
                $signer->setSignatureFieldName($field->getQualifiedName());

                // Decodificar los datos de fondo y gráfico en base64
                $bgData = base64_decode($backgroundSign);
                $graphData = base64_decode($base64GraphicSign);

                // Nombres de archivo
                $bgFilename = 'bg_' . $timestamp . '.png';
                $graphFilename = 'graph_' . $timestamp . '.png';

                // Guardar archivos usando Storage
                Storage::disk('local')->put("/public/icons/" . $bgFilename, $bgData);
                Storage::disk('local')->put("/public/icons/" . $graphFilename, $graphData);

                // Establece la razón y ubicación si se proporcionan
                if ($reasonSign !== "") {
                    $signer->setReason($reasonSign);
                }

                if ($locationSign !== "") {
                    $signer->setLocation($locationSign);
                }

                // Crea una apariencia de firma dinámica
                $appearance = new \SetaPDF_Signer_Signature_Appearance_Dynamic($module);
                // Crea una instancia de fuente para la apariencia
                $font = new \SetaPDF_Core_Font_TrueType_Subset(
                    $document,
                    'fonts/DejaVuSans.ttf'
                );
                // Establece la fuente en la apariencia
                $appearance->setFont($font);

                // Agrega fondo si se proporciona
                if ($backgroundSign !== "" && $backgroundSign !== null) {
                    // Carga una imagen PNG para la apariencia de fondo
                    $bgImage = \SetaPDF_Core_Image::getByPath(public_path('storage/icons/' . $bgFilename));
                    $xObject = $bgImage->toXObject($document);
                    // Añádelo a la apariencia
                    $appearance->setBackgroundLogo($xObject, .3);
                }

                // Agrega gráfico si se proporciona
                if ($graphicSign) {
                    $graphicImage = \SetaPDF_Core_Image::getByPath(public_path('storage/icons/' . $graphFilename));
                    $xObject = $graphicImage->toXObject($document);
                    // Añádelo a la apariencia
                    $appearance->setGraphic($xObject);
                } else {
                    $appearance->setGraphic(false);
                }

                // Configura qué campos mostrar en la firma
                $appearance->setShow(
                    \SetaPDF_Signer_Signature_Appearance_Dynamic::CONFIG_DISTINGUISHED_NAME,
                    false
                );

                $appearance->setShowTpl(
                    \SetaPDF_Signer_Signature_Appearance_Dynamic::CONFIG_DATE,
                    '%s'
                );

                $appearance->setShowTpl(
                    \SetaPDF_Signer_Signature_Appearance_Dynamic::CONFIG_NAME,
                    'Firmado por:' . chr(10) . '%s'
                );

                $appearance->setShowTpl(
                    \SetaPDF_Signer_Signature_Appearance_Dynamic::CONFIG_REASON,
                    'Razón: %s'
                );

                $appearance->setShowTpl(
                    \SetaPDF_Signer_Signature_Appearance_Dynamic::CONFIG_LOCATION,
                    'Ubicación: %s'
                );

                $appearance->setShowFormat(
                    \SetaPDF_Signer_Signature_Appearance_Dynamic::CONFIG_DATE,
                    'Y/m/d H:i:s'
                );

                // Asigna la apariencia al firmador
                $signer->setAppearance($appearance);

                break;
            default:
                $logService->log("Error en el firmado del pdf: Tipo de firma no válida ($visibleSign)");
                return ProjectResponse::error("Error en el firmado del pdf.", 400, "Tipo de firma no válida ($visibleSign)");
                break;
        }

        // Intenta firmar el documento
        try {
            $signer->sign($module); // Firma el documento
            $b64 = base64_encode((string) $writer); // Codifica el documento firmado en base64
            $this->deleteFiles($arrDocs); // Elimina archivos temporales

            $logService->log("Documento firmado correctamente");
            $logService->log("Proceso finalizado", false, true);

            try {
                DB::beginTransaction();

                $objSolicitud = Solicitud::create([
                    'hash_documento' => hash('sha512', $pdfData),
                    'users_email' => Auth::user()->email,
                    'estado' => true,
                ]);

                SolicitudCampo::insert([
                    'solicitud_id' => $objSolicitud->id,
                    'p12_hash' => hash('sha512', $p12Data),
                    'p12_pass' => Hash::make($passP12),
                    'con_estampa' => $withStamp,
                    'estampa_url' => $urlStamp,
                    'estampa_usuario' => $userStamp,
                    'estampa_pass' => Hash::make($passStamp),
                    'tipo_firma_id' => $visibleSign,
                    'firma_imagen' => ($imgData !== null ? hash('sha512', $imgData) : $imgData),
                    'firma_informacion' => $posSign,
                    'con_grafico' => $graphicSign,
                    'grafico_imagen' => ($graphData !== null ? hash('sha512', $graphData) : $graphData),
                    'grafico_fondo' => ($bgData !== null ? hash('sha512', $bgData) : $bgData),
                    'firma_razon' => $reasonSign,
                    'firma_ubicacion' => $locationSign,
                    'qr_imagen' => ($qrData !== null ? hash('sha512', $qrData) : $qrData),
                    'qr_informacion' => $infoQR,
                    'qr_texto' => $txtQR,
                ]);

                DB::commit();
                // Retorna la respuesta exitosa con el PDF firmado
                return ProjectResponse::success(
                    [
                        'pdf' => $b64,
                    ],
                    'Documento firmado correctamente'
                );
            } catch (\Exception $e) {
                DB::rollBack();
                $logService->log("Error en el registro de la solicitud");
                $logService->log($e->getMessage() . '. Line: ' . $e->getLine());
                $logService->log("Proceso finalizado", false, true);

                // En caso de error, elimina archivos temporales y retorna un error
                $this->deleteFiles($arrDocs);
                return ProjectResponse::error("Error en el registro de la solicitud.", 400, $e->getMessage() . '. Line: ' . $e->getLine());
            }
        } catch (\SetaPDF_Signer_Exception $th) {
            $logService->log("Error en el proceso");
            $logService->log($th->getMessage());
            $logService->log("Proceso finalizado", false, true);

            // En caso de error, elimina archivos temporales y retorna un error
            $this->deleteFiles($arrDocs);
            return ProjectResponse::error("Error en el firmado del pdf.", 400, $th->getMessage());
        }
    }

    /**
     * Elimina los archivos temporales generados durante el proceso.
     *
     * @param array $files
     * @return void
     */
    private function deleteFiles($arrFiles = [])
    {
        foreach ($arrFiles as $file) {
            if (Storage::disk('local')->exists($file)) {
                Storage::disk('local')->delete($file);
            }
        }
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

        return ProjectResponse::success($solicitudes); // Retorna los datos en formato JSON
    }
}
