<?php

namespace App\Http\Controllers;

use App\Models\Plantilla;
use App\Models\PlantillaCampo;
use App\Models\TipoCampo;
use App\Services\ResponseService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

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
        $this->userSession = Auth()->user();
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
}