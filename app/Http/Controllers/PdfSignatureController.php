<?php

namespace App\Http\Controllers;

use App\Helpers\ApiResponse;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use SimpleSoftwareIO\QrCode\Facades\QrCode;
use SetaPDF_Signer_X509_Certificate as Certificate;
use SetaPDF_Signer_Pem as Pem;
use SetaPDF_Signer_X509_Collection as Collection;
use SetaPDF_Signer_ValidationRelatedInfo_Collector as Collector;
use Throwable;

class PdfSignatureController extends Controller
{
    public function signPdf(Request $request)
    {
        try {
            // Validar los datos de entrada
            $request->validate([
                'base64PDF' => 'required|string',
                'base64P12' => 'required|string',
                'passP12' => 'required|string',
                'withStamp' => 'required|boolean',
                'urlStamp' => 'required|string',
                'userStamp' => 'nullable|string',
                'passStamp' => 'nullable|string',
                'visibleSign' => 'required|integer|in:0,1,2',
                'imgSign' => 'nullable|string',
                'posSign' => [
                    'nullable',
                    'string',
                    function ($attribute, $value, $fail) use ($request) {
                        if (in_array($request->input('visibleSign'), [1, 2]) && empty($value)) {
                            $fail($attribute . ' is required when visibleSign is 1 or 2.');
                        } elseif (!empty($value) && !preg_match('/^\d+,\d+,\d+,\d+,\d+$/', $value)) {
                            $fail('The format of ' . $attribute . ' is invalid. It must be pag,x,y,width,height.');
                        }
                    },
                ],
                'graphicSign' => [
                    'nullable',
                    'boolean',
                    function ($attribute, $value, $fail) use ($request) {
                        if ($request->input('visibleSign') == 2 && $value === null) {
                            $fail($attribute . ' is required when visibleSign is 2.');
                        }
                    },
                ],
                'base64GraphicSign' => [
                    'nullable',
                    'string',
                    function ($attribute, $value, $fail) use ($request) {
                        if ($request->input('graphicSign') && $request->input('visibleSign') == 2 && empty($value)) {
                            $fail($attribute . ' is required when graphicSign is true and visibleSign is 2.');
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
            return ApiResponse::error('Validation failed', 400, $th->errors());
        }

        $base64PDF = $request->base64PDF;
        $base64P12 = $request->base64P12;
        $passP12 = $request->passP12;
        $withStamp = $request->withStamp;
        $urlStamp = $request->urlStamp;
        $userStamp = $request->userStamp;
        $passStamp = $request->passStamp;
        $visibleSign = (int) $request->visibleSign;
        $imgSign = $request->imgSign;
        $posSign = $request->posSign;
        $graphicSign = $request->graphicSign;
        $base64GraphicSign = $request->base64GraphicSign;
        $backgroundSign = $request->backgroundSign;
        $reasonSign = $request->reasonSign;
        $locationSign = $request->locationSign;
        $txtQR = $request->txtQR;
        $infoQR = $request->infoQR;

        $defaultPosSign = \SetaPDF_Signer_SignatureField::POSITION_LEFT_BOTTOM;

        $arrDocs = array();

        $pdfData = base64_decode($base64PDF);
        $p12Data = base64_decode($base64P12);

        $timestamp = Carbon::now()->format('YmdHis') . '' . Carbon::now()->microsecond;

        $pdfFilename = 'pdf_' . $timestamp . '.pdf';
        $p12Filename = 'p12_' . $timestamp . '.p12';

        Storage::disk('local')->put("/public/" . $pdfFilename, $pdfData);
        Storage::disk('local')->put("/public/certificates/" . $p12Filename, $p12Data);
        $arrDocs[] = "/public/" . $pdfFilename;
        $arrDocs[] = "/public/certificates/" . $p12Filename;

        $writer = new \SetaPDF_Core_Writer_String();
        $document = \SetaPDF_Core_Document::loadByFilename(public_path('storage/' . $pdfFilename), $writer);
        $lastPage = $document->getCatalog()->getPages()->count();
        $width = $document->getCatalog()->getPages()->getPage($lastPage)->getWidth();
        $height = $document->getCatalog()->getPages()->getPage($lastPage)->getHeight();

        // QR
        if ($txtQR !== null && $txtQR !== "" && $infoQR !== null && $infoQR !== "") {
            list($pagQR, $xQR, $yQR, $sizeQR) = explode(',', $infoQR);

            $pagQR = (int) $pagQR;
            $xQR = (int) $xQR;
            $yQR = (int) $yQR;
            $sizeQR = (int) $sizeQR;
            $correccionQR = "M";
            $typeQR = "png";

            if ($pagQR > $lastPage) {
                return ApiResponse::error("Page $pagQR dont exist in document.", 400);
            }

            $image = QrCode::format($typeQR)
                ->size($sizeQR)
                ->style('round')
                ->errorCorrection($correccionQR)
                ->generate($txtQR);

            $qrBase64 = base64_encode($image);
            $qrData = base64_decode($qrBase64);
            $qrFilename = 'qr_' . $timestamp . ".$typeQR";

            Storage::disk('local')->put("/public/qrs/" . $qrFilename, $qrData);
            $arrDocs[] = "/public/qrs/" . $qrFilename;

            $image = \SetaPDF_Core_Image::getByPath(public_path('storage/qrs/' . $qrFilename))->toXObject($document);
            $canvas = $document->getCatalog()->getPages()->getPage($pagQR)->getCanvas();
            $image->draw($canvas, $xQR, $yQR, $sizeQR, $sizeQR);
        }
        // Fin QR

        $signer = new \SetaPDF_Signer($document);
        // $signer->setSignatureContentLength(26000);
        $signer->setSignatureContentLength(50000);

        // Convertir el archivo P12 a PEM si es necesario
        $certPath = public_path('storage/certificates/' . $p12Filename); //Route P12 CONFIRMED
        $certContent = file_get_contents($certPath);

        if (!$certContent) {
            $this->deleteFiles($arrDocs);
            return ApiResponse::error('Validation failed', 400, $th->errors());
        }

        /* Proceso para trabajar con P12 en producción */
        $pkcs12 = [];
        if (pathinfo($certPath, PATHINFO_EXTENSION) === 'p12') {
            if (!openssl_pkcs12_read($certContent, $pkcs12, $passP12)) {
                $this->deleteFiles($arrDocs);
                return ApiResponse::error('No se pudo leer el certificado PKCS#12. Verifica la contraseña.', 400);
            }
            $certContent = $pkcs12['cert'];
            $privateKey = $pkcs12['pkey'];
        } else {
            $certContent = openssl_x509_read($certContent);
            $privateKey = openssl_pkey_get_private($certContent, $passP12);
        }

        if (!$certContent) {
            $this->deleteFiles($arrDocs);
            return ApiResponse::error('No se pudo leer el certificado X.509.', 400);
        }

        if (!$privateKey) {
            $this->deleteFiles($arrDocs);
            return ApiResponse::error('No se pudo leer la clave privada.', 400);
        }

        $module = new \SetaPDF_Signer_Signature_Module_Pades();
        $module->setCertificate($pkcs12['cert']);
        $module->setPrivateKey($pkcs12['pkey']);

        $certificate = new Certificate($pkcs12['cert']);

        if (isset($pkcs12['extracerts']) && count($pkcs12['extracerts'])) {
            $trustedCertificates = new Collection($pkcs12['extracerts']);
            $collector = new Collector($trustedCertificates);
            $collector->getExtraCertificates()->add($pkcs12['extracerts']);
        } else {
            $collector = new Collector();
        }

        /* Fin del espacio para producción */

        // /* Esto se debe arreglar: Se descomenta arriba y se debe arreglar lo de abajo con la información correcta del certificado y la private key obtenida en la variable $certs */
        // $certPath = public_path('storage/certificates/ltvCertDos_cert.pem');
        // $privateKeyPath = public_path('storage/certificates/ltvCertDos_key.pem');

        // $module = new \SetaPDF_Signer_Signature_Module_Pades();
        // $certificate = new \SetaPDF_Signer_X509_Certificate(file_get_contents($certPath));
        // $module->setCertificate($certificate);
        // $module->setPrivateKey([file_get_contents($privateKeyPath), ""]);

        // $trustedCertificates = new Collection(Pem::extractFromFile($certPath));
        // $collector = new Collector($trustedCertificates);
        // $certificate = new Certificate(file_get_contents($certPath));
        // /* Fin del espacio de pruebas para desarrollo */

        try {
            $vriData = $collector->getByCertificate($certificate);
            $module->setExtraCertificates($vriData->getCertificates());
            foreach ($vriData->getOcspResponses() as $ocspResponse) {
                $module->addOcspResponse($ocspResponse);
            }

            foreach ($vriData->getCrls() as $crl) {
                $module->addCrl($crl);
            }
        } catch (\SetaPDF_Signer_ValidationRelatedInfo_Exception $th) {
            // Permite firmar pero sin ltv
            // dd($th);
        }

        if ($withStamp) {
            // Datos para la estampa de tiempo
            $tsModule = new \SetaPDF_Signer_Timestamp_Module_Rfc3161_Curl($urlStamp);

            if (isset($userStamp)) {
                $tsModule->setCurlOption(\CURLOPT_USERPWD, $userStamp . ':' . $passStamp);
            }

            $signer->setTimestampModule($tsModule);
            // Fin Datos para la estampa de tiempo
        }

        // Configuración de la Apariencia de la firma
        switch ($visibleSign) {
            case 0:
                //Firma Invisible
                // add a signature field with the doubled height of the text block
                $field = $signer->addSignatureField(
                    $timestamp
                );

                // set the signature field name
                $signer->setSignatureFieldName($field->getQualifiedName());

                break;
            case 1:
                // Dividir la cadena en partes
                list($page, $x, $y, $width, $height) = explode(',', $posSign);

                // Convertir los valores a enteros (si es necesario)
                $page = (int) $page;
                $x = (int) $x;
                $y = (int) $y;
                $width = (int) $width;
                $height = (int) $height;

                if ($page > $lastPage) {
                    return ApiResponse::error("Page $page dont exist in document.", 400);
                }

                // Decodificar los datos base64
                if ($imgSign !== null && $imgSign !== "") {
                    $imgData = base64_decode($imgSign);

                    // Nombres de archivo
                    $imgFilename = 'seal_' . $timestamp . '.png';

                    // Guardar archivos usando Storage
                    Storage::disk('local')->put("/public/icons/" . $imgFilename, $imgData);
                    $arrDocs[] = "/public/icons/" . $imgFilename;

                    $image = \SetaPDF_Core_Image::getByPath(public_path('storage/icons/' . $imgFilename));
                    $imageXObject = $image->toXObject($document);

                    // you may define your own size here but it has to be the aspect ratio as the background image
                    $width = $imageXObject->getWidth();
                    $height = $imageXObject->getHeight();
                    $xObject = \SetaPDF_Core_XObject_Form::create($document, [0, 0, $width, $height]);

                    $canvas = $xObject->getCanvas();
                    $imageXObject->draw($canvas, 0, 0, $width, $height);

                    // create a font instance
                    $font = new \SetaPDF_Core_Font_Type0_Subset($document, public_path('fonts/DejaVuSerif-Italic.ttf'));

                    // let's create a simple text block
                    $textBlock = new \SetaPDF_Core_Text_Block($font, 10);
                    $textBlock->setTextWidth($width - 70);
                    $textBlock->setLineHeight(11);
                    $textBlock->setPadding(5);

                    /* Revisar esta parte... No sabría hacer para obtener la información específica de la firma desde el método de openssl */
                    $certificateInfo = openssl_x509_parse('file://' . $certPath);
                    $text = "Firmado por:\n"
                        . (isset($certificateInfo['subject']['CN']) ? $certificateInfo['subject']['CN'] : $signer->getName()) . "\n"
                        . date('Y/m/d H:i:s');
                    $textBlock->setText($text);
                    $textBlock->draw($canvas, 0, $height / 2 - $textBlock->getHeight() / 2);

                    // create a XObject appearance instance
                    $appearance = new \SetaPDF_Signer_Signature_Appearance_XObject($xObject);

                    // add a signature field with the doubled height of the text block
                    $field = $signer->addSignatureField(
                        $timestamp,
                        $lastPage,
                        $defaultPosSign,
                        ['x' => $x, 'y' => $y],
                        $width,
                        $height
                    );

                    // set the signature field name
                    $signer->setSignatureFieldName($field->getQualifiedName());

                    // and pass it to the signer instance
                    $signer->setAppearance($appearance);
                } else {
                    $xObject = \SetaPDF_Core_XObject_Form::create($document, [0, 0, $width, $height]);

                    $canvas = $xObject->getCanvas();

                    // create a font instance
                    $font = new \SetaPDF_Core_Font_Type0_Subset($document, public_path('fonts/DejaVuSerif-Italic.ttf'));

                    // let's create a simple text block
                    $textBlock = new \SetaPDF_Core_Text_Block($font, 10);
                    $textBlock->setTextWidth($width);
                    $textBlock->setLineHeight(11);
                    $textBlock->setPadding(5);

                    /* Revisar esta parte... No sabría hacer para obtener la información específica de la firma desde el método de openssl */
                    $certificateInfo = openssl_x509_parse('file://' . $certPath);
                    $text = "Firmado por:\n"
                        . (isset($certificateInfo['subject']['CN']) ? $certificateInfo['subject']['CN'] : $signer->getName()) . "\n"
                        . date('Y/m/d H:i:s');
                    $textBlock->setText($text);
                    $textBlock->draw($canvas, 0, $height / 2 - $textBlock->getHeight() / 2);

                    // create a XObject appearance instance
                    $appearance = new \SetaPDF_Signer_Signature_Appearance_XObject($xObject);

                    // add a signature field with the doubled height of the text block
                    $field = $signer->addSignatureField(
                        $timestamp,
                        $lastPage,
                        $defaultPosSign,
                        ['x' => $x, 'y' => $y],
                        $width,
                        $height
                    );

                    // set the signature field name
                    $signer->setSignatureFieldName($field->getQualifiedName());

                    // and pass it to the signer instance
                    $signer->setAppearance($appearance);
                }
                break;
            case 2:
                // Dividir la cadena en partes
                list($page, $x, $y, $width, $height) = explode(',', $posSign);

                // Convertir los valores a enteros (si es necesario)
                $page = (int) $page;
                $x = (int) $x;
                $y = (int) $y;
                $width = (int) $width;
                $height = (int) $height;

                if ($page > $lastPage) {
                    return ApiResponse::error("Page $page dont exist in document.", 400);
                }

                // add a signature field with the doubled height of the text block
                $field = $signer->addSignatureField(
                    $timestamp,
                    $lastPage,
                    $defaultPosSign,
                    ['x' => $x, 'y' => $y],
                    $width,
                    $height
                );

                // Decodificar los datos base64
                $bgData = base64_decode($backgroundSign);
                $graphData = base64_decode($base64GraphicSign);

                // Nombres de archivo
                $bgFilename = 'bg_' . $timestamp . '.png';
                $graphFilename = 'graph_' . $timestamp . '.png';

                // Guardar archivos usando Storage
                Storage::disk('local')->put("/public/icons/" . $bgFilename, $bgData);
                Storage::disk('local')->put("/public/icons/" . $graphFilename, $graphData);

                if ($reasonSign !== "") {
                    $signer->setReason($reasonSign);
                }

                if ($locationSign !== "") {
                    $signer->setLocation($locationSign);
                }

                // create a Signature appearance
                $appearance = new \SetaPDF_Signer_Signature_Appearance_Dynamic($module);
                // create a font instance for the signature appearance
                $font = new \SetaPDF_Core_Font_TrueType_Subset(
                    $document,
                    'fonts/DejaVuSans.ttf'
                );
                // set the font
                $appearance->setFont($font);

                if ($backgroundSign !== "" && $backgroundSign !== null) {
                    // load a PNG image for the background appearance
                    $bgImage = \SetaPDF_Core_Image::getByPath(public_path('storage/icons/' . $bgFilename));
                    $xObject = $bgImage->toXObject($document);
                    // add it to the appearance
                    $appearance->setBackgroundLogo($xObject, .3);
                }

                if ($graphicSign) {
                    // load a PNG image for the graphic appearance
                    $graphicImage = \SetaPDF_Core_Image::getByPath(public_path('storage/icons/' . $graphFilename));
                    $xObject = $graphicImage->toXObject($document);
                    // add it to the appearance
                    $appearance->setGraphic($xObject);
                } else {
                    $appearance->setGraphic(false);
                }

                // Campos
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

                $signer->setAppearance($appearance);

                break;
            default:
                return ApiResponse::error("Error en el firmado del pdf.", 400, "Tipo de firma no válida ($visibleSign)");
                break;
        }

        try {
            $signer->sign($module);
            $b64 = base64_encode((string) $writer);
            $this->deleteFiles($arrDocs);

            return ApiResponse::success(
                [
                    'pdf' => $b64,
                ],
                'Documento firmado correctamente'
            );
        } catch (\SetaPDF_Signer_Exception $th) {
            $this->deleteFiles($arrDocs);
            return ApiResponse::error("Error en el firmado del pdf.", 400, $th->getMessage());
        }
    }

    private function deleteFiles($arrFiles = [])
    {
        foreach ($arrFiles as $file) {
            if (Storage::disk('local')->exists($file)) {
                Storage::disk('local')->delete($file);
            }
        }
    }
}
