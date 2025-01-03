<?php

namespace App\Services;

use App\Models\Solicitud;
use App\Models\SolicitudCampo;
use App\Models\TipoFirma;
use Carbon\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use SimpleSoftwareIO\QrCode\Facades\QrCode;
use SetaPDF_Signer_X509_Certificate as Certificate;
use SetaPDF_Signer_X509_Collection as Collection;
use SetaPDF_Signer_ValidationRelatedInfo_Collector as Collector;

class PdfSignerService
{
    public function signPdf($request, $logService, $responseService)
    {
        //Validaciones
        $arrErrores = array();

        if ($request->base64PDF == null || $request->base64PDF == "") {
            $arrErrores[] = "base64PDF: El b64 del PDF es obligatorio";
        }

        if ($request->base64P12 == null || $request->base64P12 == "") {
            $arrErrores[] = "base64P12: El b64 del certificado es obligatorio";
        }

        if ($request->passP12 == null || $request->passP12 == "") {
            $arrErrores[] = "passP12: La contraseña del certificado es obligatoria";
        }

        if ($request->withStamp == null) {
            $arrErrores[] = "withStamp: La opción 'Con estampa de tiempo' es obligatoria";
        }

        if (!in_array($request->withStamp, [0, 1])) {
            $arrErrores[] = "withStamp: El valor de 'Con estampa de tiempo' no es válido. Debe ser 'Sí(1)' o 'No(0)'";
        }

        if ($request->withStamp == 1) {
            if ($request->urlStamp == null || $request->urlStamp == "") {
                $arrErrores[] = "urlStamp: La url de la estampa es obligatoria, cuando 'Con estampa de tiempo' es 'Sí(1)'";
            } else if (!preg_match('/^(https?:\/\/)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,6})(:[0-9]{1,5})?(\/.*)?$/', $request->urlStamp)) {
                $arrErrores[] = "urlStamp: El formato de la url de la estampa es inválido";
            }
        }

        if ($request->visibleSign == null || $request->visibleSign == "") {
            $arrErrores[] = "visibleSign: El tipo de firma es obligatorio";
        } else if (!in_array((int) $request->visibleSign, [TipoFirma::TIPO_FIRMA_INVISIBLE, TipoFirma::TIPO_FIRMA_VISIBLE, TipoFirma::TIPO_FIRMA_VISIBLE_DOS])) {
            $arrErrores[] = "visibleSign: El tipo de firma '{$request->visibleSign}' no es válido";
        }

        if (
            in_array((int) $request->visibleSign, [TipoFirma::TIPO_FIRMA_VISIBLE, TipoFirma::TIPO_FIRMA_VISIBLE_DOS])
            && ($request->posSign == null || $request->posSign == "")
        ) {
            $arrErrores[] = "posSign: Las propiedades de la firma son obligatorias cuando el tipo de firma son 'Visible(2)' y Visible 2(3)";
        } else if (
            in_array((int) $request->visibleSign, [TipoFirma::TIPO_FIRMA_VISIBLE, TipoFirma::TIPO_FIRMA_VISIBLE_DOS])
            && ($request->posSign != null && $request->posSign != "") && !preg_match('/^\d+,\d+,\d+,\d+,\d+$/', $request->posSign)
        ) {
            $arrErrores[] = "posSign: El formato de las propiedades de la firma es inválido. Debe ser pag,x,y,width,height";
        }

        if (
            (int) $request->visibleSign == TipoFirma::TIPO_FIRMA_VISIBLE_DOS
            && ($request->graphicSign == null || $request->graphicSign == "")
        ) {
            $arrErrores[] = "graphicSign: La opción 'Con firma gráfica' es obligatoria cuando el tipo de firma es Visible 2(3)";
        } else if (
            (int) $request->visibleSign == TipoFirma::TIPO_FIRMA_VISIBLE_DOS
            && !in_array($request->graphicSign, [0, 1])
        ) {
            $arrErrores[] = "graphicSign: El valor de 'Con firma gráfica' no es válido. Debe ser 'Sí(1)' o 'No(0)'";
        }

        if (
            (int) $request->visibleSign == TipoFirma::TIPO_FIRMA_VISIBLE_DOS
            && $request->graphicSign == 1
            && ($request->base64GraphicSign == null || $request->base64GraphicSign == "")
        ) {
            $arrErrores[] = "base64GraphicSign: La imágen gráfica de la firma es obligatoria cuando el tipo de firma es Visible 2(3) y la opción 'Con firma gráfica' es 'Sí(1)'";
        }

        if (
            ($request->txtQR != null && $request->txtQR != "")
            && ($request->infoQR == null || $request->infoQR == "")
        ) {
            $arrErrores[] = "infoQR: Las propiedades del código QR son obligatorias cuando el texto del QR(txtQR) no es vacío";
        } else if (
            ($request->infoQR != null && $request->infoQR != "")
            && !preg_match('/^\d+,\d+,\d+,\d+$/', $request->infoQR)
        ) {
            $arrErrores[] = "infoQR: El formato de las propiedades del código QR es inválido. Debe ser pag,x,y,size";
        }

        if (
            ($request->infoQR != null && $request->infoQR != "")
            && ($request->txtQR == null || $request->txtQR == "")
        ) {
            $arrErrores[] = "txtQR: El texto del QR es obligatorio cuando las propiedades(infoQR) no están vacías";
        }

        if (count($arrErrores) > 0) {
            $logService->log("Error en el proceso de validación");
            $logService->log(implode(".\n", $arrErrores));
            $logService->log("Proceso finalizado", false, true);
            return $responseService->error("Error en el proceso de validación", 400, $arrErrores);
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

        try {
            $document = \SetaPDF_Core_Document::loadByFilename(public_path('storage/' . $pdfFilename), $writer);
        } catch (\SetaPDF_Core_Parser_CrossReferenceTable_Exception $th) {
            $this->deleteFiles($arrDocs);
            $logService->log("Base 64 del PDF inválido");
            $logService->log($th->getMessage());
            $logService->log("Proceso finalizado", false, true);
            return $responseService->error('Invalid base64PDF', 400, $th->getMessage());
        }

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
                $pagQR = $lastPage;
                // $this->deleteFiles($arrDocs);
                // $logService->log("Page $pagQR dont exist in document.");
                // return $responseService->error("Page $pagQR dont exist in document.", 400);
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
            $logService->log("Contenido del certificado inválido");
            $logService->log($th->errors());
            $logService->log("Proceso finalizado", false, true);
            return $responseService->error('Invalid certificate content', 400, $th->errors());
        }

        // Proceso para leer el certificado P12
        $pkcs12 = [];
        if (pathinfo($certPath, PATHINFO_EXTENSION) === 'p12') {
            if (!openssl_pkcs12_read($certContent, $pkcs12, $passP12)) {
                $this->deleteFiles($arrDocs);
                $logService->log("No se pudo leer el certificado PKCS#12. Verifica la contraseña.");
                $logService->log("Proceso finalizado", false, true);
                return $responseService->error('No se pudo leer el certificado PKCS#12. Verifica la contraseña.', 400);
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
            $logService->log("Proceso finalizado", false, true);
            return $responseService->error('No se pudo leer el certificado X.509.', 400);
        }

        // Verifica si se ha podido leer la clave privada
        if (!$privateKey) {
            $this->deleteFiles($arrDocs);
            $logService->log("No se pudo leer la clave privada.");
            $logService->log("Proceso finalizado", false, true);
            return $responseService->error('No se pudo leer la clave privada.', 400);
        }

        // Verifica la fecha de validez del certificado
        try {
            $certificateInfoValidation = openssl_x509_parse($certContent);

            $validFrom_time_t = $certificateInfoValidation["validFrom_time_t"];
            $validTo_time_t = $certificateInfoValidation["validTo_time_t"];
            $current_time = time();

            $validFrom_readable = date('Y-m-d H:i:s', $validFrom_time_t);
            $validTo_readable = date('Y-m-d H:i:s', $validTo_time_t);
            $current_readable = date('Y-m-d H:i:s', $current_time);

            if ($current_time < $validFrom_time_t || $current_time > $validTo_time_t) {
                $this->deleteFiles($arrDocs);
                $logService->log("El certificado se encuentra vencido");
                $logService->log("Proceso finalizado", false, true);
                return $responseService->error('El certificado se encuentra vencido', 400);
            }
        } catch (\Throwable $th) {
            $this->deleteFiles($arrDocs);
            $logService->log("Hubo un error en la validación de la fecha del certificado");
            $logService->log("Proceso finalizado", false, true);
            return $responseService->error('Hubo un error en la validación de la fecha del certificado', 400);
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
                    $page = $lastPage;
                    // $this->deleteFiles($arrDocs);
                    // $logService->log("Page $page dont exist in document.");
                    // return $responseService->error("Page $page dont exist in document.", 400);
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
                    try {
                        $image = \SetaPDF_Core_Image::getByPath(public_path('storage/icons/' . $imgFilename));
                    } catch (\SetaPDF_Core_Image_Exception $th) {
                        $this->deleteFiles($arrDocs);
                        $logService->log("Imagen de la firma inválida");
                        $logService->log($th->getMessage());
                        $logService->log("Proceso finalizado", false, true);
                        return $responseService->error('Invalid imgSign', 400, $th->getMessage());
                    }

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
                    $textBlock = new \SetaPDF_Core_Text_Block($font);
                    $textBlock->setTextWidth($width - 10);
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

                    $matchingFontSize = null;
                    $diff = $textBlock->getFontSize() / 2;
                    $fontSize = $textBlock->getFontSize();
                    $currentHeight = $textBlock->getTextHeight();

                    while ($diff > .01) {
                        if ($currentHeight > $height) {
                            $fontSize -= $diff;
                        } else {
                            $fontSize += $diff;
                        }

                        $diff /= 2;
                        $textBlock->setFontSize($fontSize);

                        $currentHeight = $textBlock->getTextHeight();
                        if ($currentHeight <= $height) {
                            $matchingFontSize = $fontSize;
                        }
                    }

                    if ($matchingFontSize !== $fontSize) {
                        $textBlock->setFontSize($matchingFontSize);
                    }

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
                    $textBlock = new \SetaPDF_Core_Text_Block($font);
                    $textBlock->setTextWidth($width - 5);
                    $textBlock->setPadding(5);

                    // Obtiene la información específica del certificado
                    $certificateInfo = openssl_x509_parse($certContent);
                    $text = "Firmado por:\n"
                        . (isset($certificateInfo['subject']['CN']) ? $certificateInfo['subject']['CN'] : $signer->getName()) . "\n"
                        . date('Y/m/d H:i:s');
                    $textBlock->setText($text);

                    $matchingFontSize = null;
                    $diff = $textBlock->getFontSize() / 2;
                    $fontSize = $textBlock->getFontSize();
                    $currentHeight = $textBlock->getTextHeight();

                    while ($diff > .01) {
                        if ($currentHeight > $height) {
                            $fontSize -= $diff;
                        } else {
                            $fontSize += $diff;
                        }

                        $diff /= 2;
                        $textBlock->setFontSize($fontSize);

                        $currentHeight = $textBlock->getTextHeight();
                        if ($currentHeight <= $height) {
                            $matchingFontSize = $fontSize;
                        }
                    }

                    if ($matchingFontSize !== $fontSize) {
                        $textBlock->setFontSize($matchingFontSize);
                    }

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
                    $page = $lastPage;
                    // $this->deleteFiles($arrDocs);
                    // $logService->log("Page $page dont exist in document.");
                    // return $responseService->error("Page $page dont exist in document.", 400);
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
                    try {
                        $bgImage = \SetaPDF_Core_Image::getByPath(public_path('storage/icons/' . $bgFilename));
                    } catch (\SetaPDF_Core_Image_Exception $th) {
                        $this->deleteFiles($arrDocs);
                        $logService->log("Fondo de la firma inválido");
                        $logService->log($th->getMessage());
                        $logService->log("Proceso finalizado", false, true);
                        return $responseService->error('Invalid backgroundSign', 400, $th->getMessage());
                    }

                    $xObject = $bgImage->toXObject($document);
                    // Añádelo a la apariencia
                    $appearance->setBackgroundLogo($xObject, .3);
                }

                // Agrega gráfico si se proporciona
                if ($graphicSign) {
                    try {
                        $graphicImage = \SetaPDF_Core_Image::getByPath(public_path('storage/icons/' . $graphFilename));
                    } catch (\SetaPDF_Core_Image_Exception $th) {
                        $this->deleteFiles($arrDocs);
                        $logService->log("Gráfico de la firma inválido");
                        $logService->log($th->getMessage());
                        $logService->log("Proceso finalizado", false, true);
                        return $responseService->error('Invalid graphicImage', 400, $th->getMessage());
                    }

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
                $this->deleteFiles($arrDocs);
                $logService->log("Error en el firmado del pdf.");
                $logService->log("Tipo de firma no válida ($visibleSign)");
                $logService->log("Proceso finalizado", false, true);
                return $responseService->error("Error en el firmado del pdf.", 400, "Tipo de firma no válida ($visibleSign)");
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

                if (Auth::check()) {
                    $user = Auth::user();
                } else {
                    $user = $request->user();
                }

                $objSolicitud = Solicitud::create([
                    'hash_documento' => hash('sha512', $pdfData),
                    'users_email' => $user->email,
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
                $logService->log("Documento firmado correctamente");
                $logService->log("Proceso finalizado", false, true);
                return $responseService->success(
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
                return $responseService->error("Error en el registro de la solicitud.", 400, "Hubo un error en el registro de base de datos.");
            }
        } catch (\SetaPDF_Signer_Exception $th) {
            $logService->log("Error en el proceso");
            $logService->log($th->getMessage());
            $logService->log("Proceso finalizado", false, true);

            // En caso de error, elimina archivos temporales y retorna un error
            $this->deleteFiles($arrDocs);
            return $responseService->error("Error en el firmado del pdf.", 400, $th->getMessage());
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
}
