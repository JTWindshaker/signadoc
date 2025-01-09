<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SolicitudCampo extends Model
{
    use HasFactory;

    /**
     * Indicates if the model should be timestamped.
     *
     * @var bool
     */
    public $timestamps = false;

    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'solicitud_campo';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'nombre',
        'solicitud_id',
        'p12_hash',
        'p12_pass',
        'nivel_certificacion',
        'con_estampa',
        'estampa_url',
        'estampa_usuario',
        'estampa_pass',
        'tipo_firma_id',
        'firma_con_texto',
        'firma_imagen',
        'firma_informacion',
        'con_grafico',
        'grafico_imagen',
        'grafico_fondo',
        'firma_razon',
        'firma_ubicacion',
        'qr_imagen',
        'qr_informacion',
        'qr_texto',
    ];

    /**
     * The attributes that should be hidden for arrays.
     *
     * @var array
     */
    protected $hidden = [
        'p12_pass',
        'estampa_pass',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [];
    }

    /**
     * The accessors to append to the model's array form.
     *
     * @var array
     */
    protected $appends = [];
}
