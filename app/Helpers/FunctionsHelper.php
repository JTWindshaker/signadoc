<?php

namespace App\Helpers;

class FunctionsHelper
{
    /**
     * Genera un código aleatorio.
     *
     * @param int $length Longitud del código.
     * 
     * @return string Código aleatorio.
     */
    public static function generateRandomCode($length = 8)
    {
        return substr(str_shuffle('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'), 0, $length);
    }
}
