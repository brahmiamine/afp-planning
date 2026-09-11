'use client';

import { useState } from 'react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Download, FileText, Image, FileSpreadsheet, CalendarDays } from 'lucide-react';
import { ExportPdfModal } from './export-pdf-modal';
import { ExportCsvModal } from './export-csv-modal';
import { ExportIcalModal } from './export-ical-modal';
import { TOOLBAR_ACTION_BUTTON_CLASS, TOOLBAR_ACTION_BUTTON_STYLE, TOOLBAR_ACTION_WRAP_CLASS } from './toolbar-action-button-styles';

export function ExportButton() {
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isIcalModalOpen, setIsIcalModalOpen] = useState(false);

  return (
    <div className={TOOLBAR_ACTION_WRAP_CLASS}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={TOOLBAR_ACTION_BUTTON_CLASS} style={TOOLBAR_ACTION_BUTTON_STYLE}>
            <Download className="h-4 w-4 shrink-0" />
            <span>Export</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setIsPdfModalOpen(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Export PDF
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Image className="h-4 w-4 mr-2" />
            Export Image
            <span className="ml-auto text-xs text-muted-foreground">Bientôt</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIsCsvModalOpen(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIsIcalModalOpen(true)}>
            <CalendarDays className="h-4 w-4 mr-2" />
            Export iCal
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ExportPdfModal open={isPdfModalOpen} onOpenChange={setIsPdfModalOpen} />
      <ExportCsvModal open={isCsvModalOpen} onOpenChange={setIsCsvModalOpen} />
      <ExportIcalModal open={isIcalModalOpen} onOpenChange={setIsIcalModalOpen} />
    </div>
  );
}
