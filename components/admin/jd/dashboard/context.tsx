import { createContext, useContext, useCallback, type ReactNode } from "react";
import { useOverlayState } from "@heroui/react";
import type { CalendarDate } from "@internationalized/date";
import type { RangeValue } from "react-aria-components";

import type {
  JobDescription,
  JobDescriptionFormData,
  JdEditFormData,
  JdStatus,
} from "@/lib/jd/types";

// Hooks
import { useJdListState } from "./hooks/use-jd-list-state";
import { useJdFiltersState } from "./hooks/use-jd-filters-state";
import { useJdCreateState } from "./hooks/use-jd-create-state";
import { useJdEditState } from "./hooks/use-jd-edit-state";
import { useJdDrawerState } from "./hooks/use-jd-drawer-state";

export interface JdDashboardContextValue {
  canManageJds: boolean;
  chapters: readonly { id: string; name: string }[];
  allPipelineStages: readonly {
    id: string;
    label: string;
    code: string;
    color: string;
  }[];

  // Data state
  rows: JobDescription[];
  loading: boolean;
  fetchError: string | null;
  statusUpdateError: string | null;
  statusUpdatingId: number | null;
  deletingId: number | null;
  deleteError: string | null;
  setDeletingId: (id: number | null) => void;

  // Filtering & Pagination
  page: number;
  setPage: (page: number) => void;
  jdListSearch: string;
  setJdListSearch: (search: string) => void;
  jdListStatusKey: string;
  setJdListStatusKey: (status: string) => void;
  jdStartDateRange: RangeValue<CalendarDate> | null;
  setJdStartDateRange: (range: RangeValue<CalendarDate> | null) => void;
  filteredRows: JobDescription[];
  totalPages: number;
  safePage: number;
  paginatedRows: JobDescription[];
  startIdx: number;
  endIdx: number;

  // Overlay States
  jdModal: ReturnType<typeof useOverlayState>;
  deleteModal: ReturnType<typeof useOverlayState>;
  editIntakeModal: ReturnType<typeof useOverlayState>;

  // Detail Drawer
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  activeRow: JobDescription | null;
  setActiveRow: (row: JobDescription | null) => void;
  drawerStatusCounts: Record<string, number> | null;
  drawerStatusCountsError: string | null;
  drawerViewerEmails: string[];
  setDrawerViewerEmails: React.Dispatch<React.SetStateAction<string[]>>;
  drawerViewerChapterIds: string[];
  setDrawerViewerChapterIds: (ids: string[]) => void;
  drawerViewersLoading: boolean;
  drawerViewersBusy: boolean;
  drawerViewersError: string | null;
  saveDrawerViewers: () => Promise<void>;

  // Create Modal / Form
  form: JobDescriptionFormData;
  setField: <K extends keyof JobDescriptionFormData>(
    key: K,
    value: JobDescriptionFormData[K],
  ) => void;
  formSubmitting: boolean;
  formError: string | null;
  createFieldErrors: { start_date?: string; hiring_deadline?: string };
  createViewerEmails: string[];
  setCreateViewerEmails: React.Dispatch<React.SetStateAction<string[]>>;
  createViewerChapterIds: string[];
  setCreateViewerChapterIds: (ids: string[]) => void;
  jdUploadPhase: "idle" | "uploading" | "extracting" | "done" | "error";
  jdUploadError: string | null;
  jdSelectedFileName: string | null;
  jdDragOver: boolean;
  setJdDragOver: (dragOver: boolean) => void;
  jdFileInputRef: React.RefObject<HTMLInputElement | null>;
  ingestJdFile: (file: File) => Promise<void>;
  discardJdDraft: () => Promise<void>;
  handleSave: (asDraft: boolean) => Promise<void>;
  selectedStageIds: string[];
  setSelectedStageIds: (ids: string[]) => void;

  // Edit Modal / Form
  editIntakeRow: JobDescription | null;
  editForm: JdEditFormData;
  setEditField: <K extends keyof JdEditFormData>(
    key: K,
    value: JdEditFormData[K],
  ) => void;
  editSubmitting: boolean;
  editError: string | null;
  editUploadPhase: "idle" | "uploading" | "extracting" | "done" | "error";
  editUploadError: string | null;
  editSelectedFileName: string | null;
  editDragOver: boolean;
  setEditDragOver: (dragOver: boolean) => void;
  editJdFileInputRef: React.RefObject<HTMLInputElement | null>;
  ingestJdFileForEdit: (file: File) => Promise<void>;
  openEdit: (row: JobDescription) => void;
  handleEditSave: () => Promise<void>;
  editSelectedStageIds: string[];
  setEditSelectedStageIds: (ids: string[]) => void;
  editStagesLoading: boolean;

  // API Helpers
  updateJdStatus: (id: number, next: JdStatus) => Promise<void>;
  confirmDelete: () => Promise<void>;
  authHeaders: () => Promise<Record<string, string>>;
}

const JdDashboardContext = createContext<JdDashboardContextValue | null>(null);

export function useJdDashboard() {
  const ctx = useContext(JdDashboardContext);
  if (!ctx) {
    throw new Error("useJdDashboard must be used within JdDashboardProvider");
  }
  return ctx;
}

interface JdDashboardProviderProps {
  canManageJds: boolean;
  chapters: readonly { id: string; name: string }[];
  allPipelineStages: readonly {
    id: string;
    label: string;
    code: string;
    color: string;
  }[];
  initialRowsPromise?: Promise<JobDescription[]>;
  children: ReactNode;
}

export function JdDashboardProvider({
  canManageJds,
  chapters,
  allPipelineStages,
  initialRowsPromise,
  children,
}: JdDashboardProviderProps) {
  const listState = useJdListState(initialRowsPromise);
  const filtersState = useJdFiltersState(listState.rows);
  const createState = useJdCreateState(
    listState.loadDescriptions,
    allPipelineStages,
  );
  const editState = useJdEditState(listState.loadDescriptions);
  const drawerState = useJdDrawerState(canManageJds);

  // Gluing status updates to active drawer item
  const updateJdStatus = useCallback(
    async (id: number, next: JdStatus) => {
      await listState.updateJdStatus(id, next, (normalized) => {
        if (drawerState.activeRow?.id === id) {
          drawerState.setActiveRow((ar) =>
            ar ? { ...ar, ...normalized } : null,
          );
        }
      });
    },
    [
      listState.updateJdStatus,
      drawerState.activeRow?.id,
      drawerState.setActiveRow,
    ],
  );

  // Gluing deletes to active drawer item and modal triggers
  const confirmDelete = useCallback(async () => {
    await listState.confirmDelete(() => {
      if (drawerState.activeRow?.id === listState.deletingId) {
        drawerState.setActiveRow(null);
        drawerState.setDrawerOpen(false);
      }
    });
  }, [
    listState.confirmDelete,
    listState.deletingId,
    drawerState.activeRow?.id,
    drawerState.setActiveRow,
    drawerState.setDrawerOpen,
  ]);

  return (
    <JdDashboardContext.Provider
      value={{
        canManageJds,
        chapters,
        allPipelineStages,

        // From list state
        rows: listState.rows,
        loading: listState.loading,
        fetchError: listState.fetchError,
        statusUpdateError: listState.statusUpdateError,
        statusUpdatingId: listState.statusUpdatingId,
        deletingId: listState.deletingId,
        deleteError: listState.deleteError,
        setDeletingId: listState.setDeletingId,
        authHeaders: listState.authHeaders,

        // From filter state
        page: filtersState.page,
        setPage: filtersState.setPage,
        jdListSearch: filtersState.jdListSearch,
        setJdListSearch: filtersState.setJdListSearch,
        jdListStatusKey: filtersState.jdListStatusKey,
        setJdListStatusKey: filtersState.setJdListStatusKey,
        jdStartDateRange: filtersState.jdStartDateRange,
        setJdStartDateRange: filtersState.setJdStartDateRange,
        filteredRows: filtersState.filteredRows,
        totalPages: filtersState.totalPages,
        safePage: filtersState.safePage,
        paginatedRows: filtersState.paginatedRows,
        startIdx: filtersState.startIdx,
        endIdx: filtersState.endIdx,

        // Modals
        jdModal: createState.jdModal,
        deleteModal: listState.deleteModal,
        editIntakeModal: editState.editIntakeModal,

        // Detail Drawer
        drawerOpen: drawerState.drawerOpen,
        setDrawerOpen: drawerState.setDrawerOpen,
        activeRow: drawerState.activeRow,
        setActiveRow: drawerState.setActiveRow,
        drawerStatusCounts: drawerState.drawerStatusCounts,
        drawerStatusCountsError: drawerState.drawerStatusCountsError,
        drawerViewerEmails: drawerState.drawerViewerEmails,
        setDrawerViewerEmails: drawerState.setDrawerViewerEmails,
        drawerViewerChapterIds: drawerState.drawerViewerChapterIds,
        setDrawerViewerChapterIds: drawerState.setDrawerViewerChapterIds,
        drawerViewersLoading: drawerState.drawerViewersLoading,
        drawerViewersBusy: drawerState.drawerViewersBusy,
        drawerViewersError: drawerState.drawerViewersError,
        saveDrawerViewers: drawerState.saveDrawerViewers,

        // Creation state
        form: createState.form,
        setField: createState.setField,
        formSubmitting: createState.formSubmitting,
        formError: createState.formError,
        createFieldErrors: createState.createFieldErrors,
        createViewerEmails: createState.createViewerEmails,
        setCreateViewerEmails: createState.setCreateViewerEmails,
        createViewerChapterIds: createState.createViewerChapterIds,
        setCreateViewerChapterIds: createState.setCreateViewerChapterIds,
        jdUploadPhase: createState.jdUploadPhase,
        jdUploadError: createState.jdUploadError,
        jdSelectedFileName: createState.jdSelectedFileName,
        jdDragOver: createState.jdDragOver,
        setJdDragOver: createState.setJdDragOver,
        jdFileInputRef: createState.jdFileInputRef,
        ingestJdFile: createState.ingestJdFile,
        discardJdDraft: createState.discardJdDraft,
        handleSave: createState.handleSave,
        selectedStageIds: createState.selectedStageIds,
        setSelectedStageIds: createState.setSelectedStageIds,

        // Editing state
        editIntakeRow: editState.editIntakeRow,
        editForm: editState.editForm,
        setEditField: editState.setEditField,
        editSubmitting: editState.editSubmitting,
        editError: editState.editError,
        editUploadPhase: editState.editUploadPhase,
        editUploadError: editState.editUploadError,
        editSelectedFileName: editState.editSelectedFileName,
        editDragOver: editState.editDragOver,
        setEditDragOver: editState.setEditDragOver,
        editJdFileInputRef: editState.editJdFileInputRef,
        ingestJdFileForEdit: editState.ingestJdFileForEdit,
        openEdit: editState.openEdit,
        handleEditSave: editState.handleEditSave,
        editSelectedStageIds: editState.editSelectedStageIds,
        setEditSelectedStageIds: editState.setEditSelectedStageIds,
        editStagesLoading: editState.editStagesLoading,

        // Actions
        updateJdStatus,
        confirmDelete,
      }}
    >
      {children}
    </JdDashboardContext.Provider>
  );
}
