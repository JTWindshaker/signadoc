<?php

namespace App\Services;

use Carbon\Carbon;

class LogService
{
    protected $filePath;

    public function __construct($taskName)
    {
        $fileName = $taskName . '_' . Carbon::now()->format('dmY') . '.log';
        $this->filePath = storage_path('logs/' . $fileName);

        if (!file_exists(dirname($this->filePath))) {
            mkdir(dirname($this->filePath), 0755, true);
        }
    }

    public function log($message, $isStart = false, $isEnd = false)
    {
        $logFile = fopen($this->filePath, 'a');
        $formattedMessage = $this->formatMessage($message, $isStart);
        $formattedMessage .= ($isEnd ? "\n" : "");

        fwrite($logFile, $formattedMessage);
        fclose($logFile);
    }

    private function formatMessage($message, $isStart)
    {
        $currentTime = Carbon::now()->toDateTimeString();
        $separator = $isStart ? "==========================================\n" : "";
        $endSeparator = $isStart ? "\n==========================================\n" : "\n";

        return $separator .
            "[$currentTime] {$message}" .
            $endSeparator;
    }
}
