<?php

namespace App\Http\Controllers;

use App\Models\Plantilla;
use App\Models\PlantillaCampo;
use App\Models\TipoCampo;
use App\Services\ResponseService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

use SetaPDF_Signer_X509_Certificate as Certificate;
use SetaPDF_Signer_X509_Collection as Collection;
use SetaPDF_Signer_ValidationRelatedInfo_Collector as Collector;
use \SetaPDF_Core_Document_Page_Annotation_FreeText as FreeTextAnnotation;


class TemplateController extends Controller
{
    protected $responseService;
    protected $userSession;

    /**
     * Instantiate a new controller instance.
     *
     * @return void
     */
    public function __construct(
        ResponseService $responseService
    ) {
        $this->responseService = $responseService;
        $this->userSession = Auth::user();
    }

    public function templateView()
    {
        return view('template');
    }

    public function listTemplates(Request $request)
    {
        $idEmpresa = $this->userSession->empresa_id;

        $plantillas = DB::table('plantilla')
            ->select(
                'id',
                'nombre',
                'estado',
                'fecha_registro',
            )->where('empresa_id', $idEmpresa)
            ->orderBy('id')
            ->get();

        foreach ($plantillas as $obj) {
            $obj->id = Crypt::encryptString($obj->id);
        }

        return $this->responseService->success($plantillas);
    }

    public function templateCreate(Request $request)
    {
        $idEmpresa = $this->userSession->empresa_id;
        $nombre = $request->nombre;
        $descripcion = $request->descripcion;
        // Definir la ruta base donde se almacenará el archivo
        $rutaBase = "plantillas/empresa_{$idEmpresa}";

        try {
            DB::beginTransaction();

            // Insertar en la base de datos
            Plantilla::insert([
                'nombre' => "{$nombre}.pdf",
                'descripcion' => $descripcion,
                'ruta' => $rutaBase,
                'empresa_id' => $idEmpresa,
                'estado' => true,
            ]);

            DB::commit();
            // Guardar el archivo usando el Facade Storage
            if ($request->hasFile('archivo')) {
                $archivo = $request->file('archivo');
                Storage::disk('public')->putFileAs($rutaBase, $archivo, "{$nombre}.pdf");
            }

            return $this->responseService->success(message: "Guardado correctamente");
        } catch (\Exception $e) {
            DB::rollBack();
            return $this->responseService->error($e->getMessage() . '. Line: ' . $e->getLine());
        }
    }

    public function templateDelete(Request $request)
    {
        try {
            $id = (int) Crypt::decryptString($request->id);
        } catch (\Exception $e) {
            return $this->responseService->error('ID inválido o manipulado.');
        }

        try {
            DB::beginTransaction();

            $objPlantilla = Plantilla::where('id', $id)->first();
            // Construir la ruta completa del archivo
            $rutaBase = "plantillas/empresa_{$objPlantilla->empresa_id}";
            $nombreArchivo = $objPlantilla->nombre;
            $rutaArchivo = "{$rutaBase}/{$nombreArchivo}";

            $objPlantilla->delete();

            DB::commit();

            // Eliminar el archivo del storage si existe
            if (Storage::disk('public')->exists($rutaArchivo)) {
                Storage::disk('public')->delete($rutaArchivo);
            }
            return $this->responseService->success(message: "Eliminado correctamente");
        } catch (\Exception $e) {
            DB::rollBack();

            return $this->responseService->error($e->getMessage() . '. Line: ' . $e->getLine());
        }
    }

    public function editTemplateView(Request $request, $idTemplate)
    {
        try {
            $id = (int) Crypt::decryptString($idTemplate);
            $objPlantilla = Plantilla::where("id", $id)->first();
            $urlPDF = "/{$objPlantilla->ruta}/{$objPlantilla->nombre}";

            return view('edit-template', [
                'id' => $idTemplate,
                'url' => $urlPDF,
            ]);
        } catch (\Exception $e) {
            abort(404, 'ID inválido o manipulado.');
        }
    }

    public function loadTemplate(Request $request)
    {
        try {
            $id = (int) Crypt::decryptString($request->id);
        } catch (\Exception $e) {
            abort(404, 'ID inválido o manipulado.');
        }

        $plantilla = DB::table('plantilla')
            ->select(
                DB::raw("CONCAT('/storage/', ruta, '/', nombre) AS ruta"),
            )->where('id', $id)
            ->first();

        $campos = DB::table('plantilla_campo')
            ->select(
                'plantilla_campo.*',
                'plantilla_campo.*',
                'tipo_campo.id as tipo_campo',
                'campo.id as campo_id',
            )->join('campo', 'campo.id', '=', 'plantilla_campo.campo_id')
            ->join('tipo_campo', 'tipo_campo.id', '=', 'campo.tipo_campo_id')
            ->where('plantilla_campo.plantilla_id', $id)
            ->get();

        foreach ($campos as $obj) {
            $obj->id = round(microtime(true) * 1000);
            $obj->idField = $obj->campo_id;
            $obj->propiedades = json_decode($obj->propiedades);
        }

        $plantilla->campos = $campos;

        return $this->responseService->success($plantilla);
    }

    public function listFields(Request $request)
    {
        $campos = DB::table('campo')
            ->select(
                'campo.id',
                'tipo_campo_id',
                'campo.nombre',
                'propiedades',
                'tipo_campo.nombre as tipo_campo'
            )->join('tipo_campo', 'tipo_campo.id', '=', 'campo.tipo_campo_id')
            ->where('campo.estado', true)
            ->orderBy('tipo_campo_id')
            ->get();

        $imagePath = 'qrExample.png';

        if (Storage::disk('public')->exists($imagePath)) {
            $imageData = base64_encode(Storage::disk('public')->get($imagePath));
            $image = 'data:image/png;base64,' . $imageData;
        } else {
            $image = null;
        }

        foreach ($campos as $obj) {
            $obj->propiedades = json_decode($obj->propiedades);

            switch ((int) $obj->id) {
                case TipoCampo::TIPO_CAMPO_TEXT:
                    break;
                case TipoCampo::TIPO_CAMPO_SELECT:
                    break;
                case TipoCampo::TIPO_CAMPO_QR:
                    $obj->propiedades->src = $image;
                    break;
                default:
                    break;
            }
        }

        return $this->responseService->success($campos);
    }

    public function saveTemplate(Request $request)
    {
        try {
            $idTemplate = (int) Crypt::decryptString($request->idTemplate);
        } catch (\Exception $e) {
            abort(404, 'ID inválido o manipulado.');
        }

        $pages = json_decode($request->fields);
        try {
            DB::beginTransaction();

            PlantillaCampo::where('plantilla_id', $idTemplate)->delete();
            foreach ($pages as $page => $pages) {
                if (!empty($pages)) {
                    foreach ($pages as $field) {
                        if ($field->idField !== TipoCampo::TIPO_CAMPO_QR) {
                            $field->name = $field->text;
                        }

                        PlantillaCampo::create([
                            'pagina' => $page,
                            'propiedades' => json_encode($field),
                            'plantilla_id' => $idTemplate,
                            'campo_id' => $field->idField,
                        ]);
                    }
                }
            }
            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();

            return $this->responseService->error($e->getMessage() . '. Line: ' . $e->getLine());
        }

        return $this->responseService->success([], 'Plantilla generada correctamente');
    }

    public function fillTemplateView(Request $request, $idTemplate)
    {
        try {
            $id = (int) Crypt::decryptString($idTemplate);
            $objPlantilla = Plantilla::where("id", $id)->first();
            $urlPDF = "/{$objPlantilla->ruta}/{$objPlantilla->nombre}";

            return view('fill-template', [
                'id' => $idTemplate,
                'url' => $urlPDF,
            ]);
        } catch (\Exception $e) {
            abort(404, 'ID inválido o manipulado.');
        }
    }

    public function fillLoadTemplate(Request $request)
    {
        try {
            $id = (int) Crypt::decryptString($request->id);
        } catch (\Exception $e) {
            abort(404, 'ID inválido o manipulado.');
        }

        $plantilla = DB::table('plantilla')
            ->select(
                DB::raw("CONCAT('/storage/', ruta, '/', nombre) AS ruta"),
            )->where('id', $id)
            ->first();

        $campos = DB::table('plantilla_campo')
            ->select(
                'plantilla_campo.*',
                'plantilla_campo.*',
                'tipo_campo.id as tipo_campo',
                'campo.id as campo_id',
            )->join('campo', 'campo.id', '=', 'plantilla_campo.campo_id')
            ->join('tipo_campo', 'tipo_campo.id', '=', 'campo.tipo_campo_id')
            ->where('plantilla_campo.plantilla_id', $id)
            ->orderBy('plantilla_campo.id')
            ->get();

        foreach ($campos as $obj) {
            $obj->idField = $obj->campo_id;
            $obj->propiedades = json_decode($obj->propiedades);
            $obj->propiedades->id = $obj->id;
        }

        $plantilla->campos = $campos;

        return $this->responseService->success($plantilla);
    }

    public function fillSaveTemplate(Request $request)
    {
        try {
            $idTemplate = (int) Crypt::decryptString($request->idTemplate);
            $objPlantilla = Plantilla::where("id", $idTemplate)->first();
        } catch (\Exception $e) {
            abort(404, 'ID inválido o manipulado.');
        }

        // $scale = $request->scale;
        $scale = 1;
        $pdfFilename = $objPlantilla->ruta . "/" . $objPlantilla->nombre;
        $timestamp = Carbon::now()->format('YmdHis') . '' . Carbon::now()->microsecond;

        // Cargar documento PDF
        $writer = new \SetaPDF_Core_Writer_String();

        try {
            $document = \SetaPDF_Core_Document::loadByFilename(public_path("storage/" . $pdfFilename), $writer);
        } catch (\SetaPDF_Core_Parser_CrossReferenceTable_Exception $th) {
            return $this->responseService->error('Archivo inválido', 400, $th->getMessage());
        }

        // Configura la apariencia del documento si tiene formulario
        $acroForm = $document->getCatalog()->getAcroForm();
        if ($acroForm->isNeedAppearancesSet()) {
            $acroForm->setNeedAppearances(false);
        }

        $pages = json_decode($request->fields);
        foreach ($pages as $page => $pages) {
            if (!empty($pages)) {
                foreach ($pages as $field) {
                    $pag = (int) $field->page;
                    $x_canvas = (float) $field->x;
                    $y_canvas = (float) $field->y;
                    $width = (float) $field->width;
                    $canvasWidth = $field->canvasWidth;
                    $canvasHeight = $field->canvasHeight;

                    $page = $document->getCatalog()->getPages()->getPage($pag);
                    $pdfWidth = $page->getWidth();
                    $pdfHeight = $page->getHeight();

                    $scaleX = $pdfWidth / $canvasWidth;
                    $scaleY = $pdfHeight / $canvasHeight;
                    $x_pdf = $x_canvas * $scaleX;

                    switch ((int) $field->idField) {
                        case TipoCampo::TIPO_CAMPO_TEXT:
                        case TipoCampo::TIPO_CAMPO_SELECT:
                            if ((int) $field->idField == TipoCampo::TIPO_CAMPO_SELECT) {
                                $valueOption = (int) $field->value;
                                $option = current(array_filter($field->options, fn($option) => $option->id === $valueOption));
                                $text = $option ? $option->name : "";
                            } else {
                                $text = $field->text;
                            }

                            $padding = $field->padding;
                            $fontSize = $field->fontSize;
                            $fontColor = $field->fill;

                            $dif_y = (($fontSize * 72) / 96) / $scale;
                            $y_pdf = ($pdfHeight - ($y_canvas * $scaleY) - $dif_y);

                            $canvas = $page->getCanvas();

                            // $font = new \SetaPDF_Core_Font_Type0_Subset($document, public_path('fonts/DejaVuSansCondensed-BoldOblique.ttf'));
                            // $font = new \SetaPDF_Core_Font_Type0_Subset($document, public_path('fonts/TimesNewRoman-BoldItalic.ttf'));
                            $font = new \SetaPDF_Core_Font_Type0_Subset($document, public_path('fonts/Calibri-BoldItalic.ttf'));

                            $textBlock = new \SetaPDF_Core_Text_Block($font);
                            $textBlock->setTextWidth($width);
                            $textBlock->setPadding($padding);
                            $textBlock->setAlign($field->align);
                            $textBlock->setFontSize($fontSize);
                            $textBlock->setLineHeight($fontSize * 0.8);
                            $textBlock->setTextColor($fontColor);
                            $textBlock->setText($text);
                            $textBlock->draw($canvas, $x_pdf, $y_pdf, $width);
                            break;
                        case TipoCampo::TIPO_CAMPO_QR:
                            $height = (float) $field->height;
                            $src = $field->src;
                            $opacity = (float) $field->opacity;

                            if (preg_match('/^data:image\/([a-zA-Z]+);base64,/', $src, $matches)) {
                                $extension = $matches[1];
                            } else {
                                $extension = null;
                            }

                            $img = str_replace('data:image/png;base64,', '', $src);
                            $imgData = base64_decode($img);

                            $image = new \Imagick();
                            $image->readImageBlob($imgData);

                            $image->setImageFormat('png');
                            $image->stripImage();
                            $image->setImageAlphaChannel(\Imagick::ALPHACHANNEL_ACTIVATE);
                            $image->evaluateImage(\Imagick::EVALUATE_MULTIPLY, $opacity, \Imagick::CHANNEL_ALPHA);

                            $imgFilename = "$timestamp-$pag.$extension";
                            $image->writeImage(storage_path('app/public/' . $imgFilename));

                            $image->clear();
                            $image->destroy();

                            try {
                                $imagePDF = \SetaPDF_Core_Image::getByPath(public_path('storage/' . $imgFilename))->toXObject($document);
                            } catch (\SetaPDF_Core_Image_Exception $th) {
                                return $this->responseService->error('Imagen no válida', 400, $th->getMessage());
                            }

                            $y_pdf = ($pdfHeight - ($y_canvas * $scaleY)) - $height;

                            $canvas = $page->getCanvas();
                            $imagePDF->draw($canvas, $x_canvas, $y_pdf, $width, $height);

                            Storage::disk('local')->delete("/public/" . $imgFilename, $imgData);
                            break;
                        default:
                            break;
                    }
                }
            }
        }

        $document->save()->finish();

        return $this->responseService->success(
            [
                'pdf' => base64_encode((string) $writer),
            ],
            'Plantilla llenada correctamente'
        );
    }
}
