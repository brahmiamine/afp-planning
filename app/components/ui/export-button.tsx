'use client';

import { useState } from 'react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Download, FileText, Image, FileSpreadsheet } from 'lucide-react';
import { ExportPdfModal } from './export-pdf-modal';
import { ExportCsvModal } from './export-csv-modal';

export function ExportButton() {
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
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
        </DropdownMenuContent>
      </DropdownMenu>
      <ExportPdfModal open={isPdfModalOpen} onOpenChange={setIsPdfModalOpen} />
      <ExportCsvModal open={isCsvModalOpen} onOpenChange={setIsCsvModalOpen} />
    </>
  );
}
