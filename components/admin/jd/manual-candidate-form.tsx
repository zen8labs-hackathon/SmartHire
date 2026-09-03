"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Button,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from "@heroui/react";
import { Lock, UploadCloud } from "lucide-react";

import { getMyProfileDetails } from "@/app/account/actions";
import { MergeDuplicateModal } from "@/components/admin/candidates/merge-duplicate-modal";
import { DatePickerField } from "@/components/admin/shell/date-picker-field";
import { useToast } from "@/components/admin/toast-provider";
import { CANDIDATE_SOURCE_VALUES } from "@/lib/candidates/source-constants";
import {
  CV_FOLDER_PREFIX,
  MAX_CV_BYTES,
  extensionFromFilename,
  isAllowedCvFilename,
} from "@/lib/candidates/upload-constants";
import {
  candidateService,
  type CandidateDedupeMatch,
} from "@/lib/service/candidate.service";
import { uploadCvService } from "@/lib/service/upload-files.service";

const FIELD_LABEL = "text-xs font-semibold uppercase tracking-wider text-muted";

type Draft = {
  name: string;
  email: string;
  phone: string;
  role: string;
  experienceYears: string;
  degree: string;
  education: string;
  gpa: string;
  englishLevel: string;
  dateOfBirth: string;
  studentYears: string;
  skills: string[];
};

const EMPTY_DRAFT: Draft = {
  name: "",
  email: "",
  phone: "",
  role: "",
  experienceYears: "",
  degree: "",
  education: "",
  gpa: "",
  englishLevel: "",
  dateOfBirth: "",
  studentYears: "",
  skills: [],
};

function skillsFromText(s: string): string[] {
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

const NUMERIC_RE = /^\d*\.?\d*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s().-]+$/;

/**
 * Type/format check for the optional fields -- every field below is stored
 * verbatim (no AI parsing), so a typo'd email or a non-numeric "years of
 * experience" would otherwise persist silently. Returns the first problem as
 * a user-facing string, or `null` when the draft is safe to submit. Mirrored
 * server-side in `app/api/admin/candidates/manual/route.ts`.
 */
function validateDraft(d: Draft): string | null {
  if (!d.name.trim()) return "Candidate name is required.";

  const email = d.email.trim();
  if (email && !EMAIL_RE.test(email)) return "Enter a valid email address.";

  const phone = d.phone.trim();
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (!PHONE_RE.test(phone) || digits.length < 7 || digits.length > 15) {
      return "Enter a valid phone number (7–15 digits).";
    }
  }

  const exp = d.experienceYears.trim();
  if (exp) {
    const n = Number(exp);
    if (!Number.isFinite(n) || n < 0 || n > 70) {
      return "Years of experience must be a number between 0 and 70.";
    }
  }

  if (d.gpa.trim() && !/\d/.test(d.gpa)) {
    return "GPA must include a numeric grade (e.g. 3.7/4.0).";
  }

  const dob = d.dateOfBirth.trim();
  if (dob) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(dob)
      ? new Date(`${dob}T00:00:00Z`)
      : new Date(NaN);
    if (Number.isNaN(parsed.getTime())) {
      return "Date of birth is not a valid date.";
    }
    if (parsed.getTime() > Date.now()) {
      return "Date of birth cannot be in the future.";
    }
    if (parsed.getUTCFullYear() < 1900) {
      return "Date of birth year looks wrong.";
    }
  }

  return null;
}

type Props = {
  jobId: string | null;
  /** Shown in the locked "Target campaign" card; ignored when `jobId` is null. */
  jobTitle?: string;
  /** Called once the candidate has been saved -- the parent refetches its list. */
  onSaved: () => void;
  /** Mirrors the auto-upload tab's close-block while a request is in flight. */
  onBusyChange?: (busy: boolean) => void;
};

/** Imperative handle so the parent modal's footer -- outside this form's own
 * scrollable body -- can trigger the save that used to live inside it. */
export type ManualCandidateFormHandle = {
  submit: () => void;
};

export const ManualCandidateForm = forwardRef<ManualCandidateFormHandle, Props>(
  function ManualCandidateForm(
    { jobId, jobTitle, onSaved, onBusyChange },
    ref,
  ) {
    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [file, setFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [sourceKey, setSourceKey] = useState<string>(
      CANDIDATE_SOURCE_VALUES[0],
    );
    const [sourceOther, setSourceOther] = useState("");
    // Recruiter label for this entry -- defaults to the signed-in user's
    // username, editable before save. `recruiterTouched` stops the async
    // default from clobbering a value the user already typed.
    const [recruiter, setRecruiter] = useState("");
    const recruiterTouchedRef = useRef(false);
    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [skillInput, setSkillInput] = useState("");
    const [busy, setBusy] = useState(false);

    // --- Duplicate-on-save flow -------------------------------------------
    // Before creating anything, the typed email/phone is checked against
    // existing candidates -- a hit opens the same merge-or-save-anyway modal
    // used by the `/candidate-detail` profile edit, instead of silently
    // attaching to (or colliding with) an existing person.
    const [dupModal, setDupModal] = useState<{
      matches: CandidateDedupeMatch[];
    } | null>(null);
    const [dupSubmitting, setDupSubmitting] = useState(false);
    const dupSnapshotRef = useRef(dupModal);
    if (dupModal) dupSnapshotRef.current = dupModal;
    const dupView = dupModal ?? dupSnapshotRef.current;

    useEffect(() => {
      let cancelled = false;
      getMyProfileDetails()
        .then((details) => {
          if (cancelled || !details) return;
          if (!recruiterTouchedRef.current) setRecruiter(details.username);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, []);

    const setBusyState = useCallback((next: boolean) => setBusy(next), []);

    // The parent modal shouldn't be closable while a duplicate check/merge
    // decision is in flight, even though `busy` itself is momentarily false
    // between the check resolving and the dedupe modal opening.
    useEffect(
      () => onBusyChange?.(busy || dupModal != null || dupSubmitting),
      [busy, dupModal, dupSubmitting, onBusyChange],
    );

    const addSkills = useCallback((tokens: string[]) => {
      if (tokens.length === 0) return;
      setDraft((d) => {
        const seen = new Set(d.skills.map((s) => s.toLowerCase()));
        const merged = [...d.skills];
        for (const t of tokens) {
          if (t && !seen.has(t.toLowerCase())) {
            seen.add(t.toLowerCase());
            merged.push(t);
          }
        }
        return { ...d, skills: merged };
      });
    }, []);

    const removeSkill = useCallback((skill: string) => {
      setDraft((d) => ({ ...d, skills: d.skills.filter((s) => s !== skill) }));
    }, []);

    const handleFileChange = (picked: File | null) => {
      if (!picked) {
        setFile(null);
        return;
      }
      if (!isAllowedCvFilename(picked.name)) {
        toast.error("Only PDF or DOCX files are supported.");
        return;
      }
      if (picked.size > MAX_CV_BYTES) {
        toast.error(`${picked.name}: exceeds the 25MB limit.`);
        return;
      }
      setFile(picked);
    };

    // Uploads the file to S3 and posts the manual-entry payload. `resolution`
    // carries the user's pick from the duplicate modal -- omitted when the
    // duplicate check found nothing, in which case the server's own
    // exact-match auto-detection applies as before.
    const performSave = useCallback(
      async (resolution?: {
        duplicateAction: "merge" | "create_new";
        mergeCandidateId?: string;
      }): Promise<boolean> => {
        const ext = extensionFromFilename(file!.name)!;
        const storageKey = `${CV_FOLDER_PREFIX}${crypto.randomUUID()}${ext}`;
        const signedUrl = await uploadCvService.signSingleUploadUrl(
          file!.name,
          storageKey,
          file!.type || null,
        );
        await uploadCvService.uploadRawFileToS3(file!, signedUrl);

        const experienceYears = draft.experienceYears.trim()
          ? Number.parseFloat(draft.experienceYears)
          : null;

        const res = await fetch("/api/admin/candidates/manual", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            storageKey,
            fileName: file!.name,
            mimeType: file!.type || null,
            source: sourceKey === "Other" ? "Other" : sourceKey,
            sourceOther: sourceKey === "Other" ? sourceOther.trim() : null,
            recruiter: recruiter.trim() || null,
            duplicateAction: resolution?.duplicateAction,
            mergeCandidateId: resolution?.mergeCandidateId ?? null,
            candidate: {
              name: draft.name.trim(),
              email: draft.email.trim() || null,
              phone: draft.phone.trim() || null,
              role: draft.role.trim() || null,
              experienceYears:
                experienceYears != null && Number.isFinite(experienceYears)
                  ? experienceYears
                  : null,
              degree: draft.degree.trim() || null,
              education: draft.education.trim() || null,
              skills: draft.skills,
              gpa: draft.gpa.trim() || null,
              englishLevel: draft.englishLevel.trim() || null,
              dateOfBirth: draft.dateOfBirth.trim() || null,
              studentYears: draft.studentYears.trim() || null,
            },
          }),
        });
        const json = (await res.json()) as {
          error?: string;
          matchedExisting?: boolean;
        };
        if (!res.ok) {
          throw new Error(json.error ?? "Could not save this candidate.");
        }
        return json.matchedExisting ?? false;
      },
      [file, draft, sourceKey, sourceOther, recruiter, jobId],
    );

    const resetForm = useCallback(() => {
      setFile(null);
      setDraft(EMPTY_DRAFT);
      setSkillInput("");
      setSourceKey(CANDIDATE_SOURCE_VALUES[0]);
      setSourceOther("");
    }, []);

    const submit = useCallback(async () => {
      if (busy || dupSubmitting) return;

      if (!file) {
        toast.error("Select a CV file first.");
        return;
      }
      if (sourceKey === "Other" && !sourceOther.trim()) {
        toast.error("Please describe the candidate source (Other).");
        return;
      }
      const validationError = validateDraft(draft);
      if (validationError) {
        toast.error(validationError);
        return;
      }

      setBusyState(true);
      try {
        const email = draft.email.trim() || null;
        const phone = draft.phone.trim() || null;
        if (email || phone) {
          const { duplicates } =
            await candidateService.checkDuplicateForNewCandidate({
              email,
              phone,
            });
          if (duplicates.length > 0) {
            setDupModal({ matches: duplicates });
            return; // finally clears `busy`; the modal drives from here
          }
        }

        const matchedExisting = await performSave();
        toast.success(
          matchedExisting
            ? "CV added to the existing candidate's profile."
            : "Candidate added successfully.",
        );
        resetForm();
        // Busy is already cleared -- the parent can close the modal from here.
        onSaved();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not save this candidate.",
        );
      } finally {
        setBusyState(false);
      }
    }, [
      busy,
      dupSubmitting,
      file,
      draft,
      sourceKey,
      sourceOther,
      performSave,
      resetForm,
      onSaved,
      setBusyState,
      toast,
    ]);

    const handleMerge = useCallback(
      async (match: CandidateDedupeMatch) => {
        setDupSubmitting(true);
        try {
          await performSave({
            duplicateAction: "merge",
            mergeCandidateId: match.id,
          });
          setDupModal(null);
          toast.success("CV added to the existing candidate's profile.");
          resetForm();
          onSaved();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Merge failed.");
        } finally {
          setDupSubmitting(false);
        }
      },
      [performSave, resetForm, onSaved, toast],
    );

    const handleSaveAnyway = useCallback(async () => {
      setDupSubmitting(true);
      try {
        await performSave({ duplicateAction: "create_new" });
        setDupModal(null);
        toast.success("Candidate added successfully.");
        resetForm();
        onSaved();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not save this candidate.",
        );
      } finally {
        setDupSubmitting(false);
      }
    }, [performSave, resetForm, onSaved, toast]);

    useImperativeHandle(ref, () => ({ submit: () => void submit() }), [submit]);

    const field = (
      label: string,
      key: keyof Omit<Draft, "skills">,
      opts?: {
        numeric?: boolean;
        type?: string;
        required?: boolean;
        fullWidth?: boolean;
      },
    ) => (
      <TextField
        className={`min-w-0${opts?.fullWidth ? " md:col-span-2" : ""}`}
      >
        <Label className={FIELD_LABEL}>
          {label}
          {opts?.required ? <span className="ml-1 text-danger">*</span> : null}
        </Label>
        <Input
          type={opts?.type}
          inputMode={opts?.numeric ? "decimal" : undefined}
          value={draft[key]}
          onChange={(e) => {
            const v = e.target.value;
            if (opts?.numeric && v !== "" && !NUMERIC_RE.test(v)) return;
            setDraft((d) => ({ ...d, [key]: v }));
          }}
          className="mt-1 h-10 w-full min-w-0 text-sm text-foreground"
          disabled={busy}
        />
      </TextField>
    );

    return (
      <div className="flex h-full min-w-0 flex-col gap-4 overflow-y-auto px-2">
        <MergeDuplicateModal
          open={dupModal != null}
          onOpenChange={(o) => {
            if (!o && !dupSubmitting) setDupModal(null);
          }}
          matches={dupView?.matches ?? []}
          isSubmitting={dupSubmitting}
          canMerge
          onMerge={handleMerge}
          onSaveAnyway={handleSaveAnyway}
          context="new-candidate"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-stretch">
          <div className="flex min-w-0 flex-col gap-3">
            <div>
              <Label className={FIELD_LABEL}>Target campaign</Label>
              <div className="mt-1.5 flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5">
                <span className="truncate text-sm font-semibold text-foreground">
                  {jobId ? (jobTitle ?? "This job") : "Candidate pool"}
                </span>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-success/20 text-success">
                  <Lock className="size-3.5" aria-hidden />
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {jobId
                  ? "Fixed to this job — the CV is linked to its campaign."
                  : "Not linked to any job — added to the shared candidate pool."}
              </p>
            </div>

            <div>
              <Label className={FIELD_LABEL}>Candidate source</Label>
              <Select
                value={sourceKey}
                onChange={(k) => {
                  const next = String(k ?? CANDIDATE_SOURCE_VALUES[0]);
                  setSourceKey(next);
                  if (next !== "Other") setSourceOther("");
                }}
                isDisabled={busy}
                className="mt-1.5"
              >
                <Select.Trigger className="h-10 w-full min-w-0 cursor-pointer">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {CANDIDATE_SOURCE_VALUES.map((s) => (
                      <ListBox.Item
                        key={s}
                        id={s}
                        textValue={s}
                        className="cursor-pointer"
                      >
                        {s}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              {sourceKey === "Other" ? (
                <TextField className="mt-2 flex w-full flex-col">
                  <Label className="text-xs font-medium text-foreground/80">
                    Describe the source
                    <span className="ml-1 text-danger">*</span>
                  </Label>
                  <Input
                    value={sourceOther}
                    onChange={(e) => setSourceOther(e.target.value)}
                    placeholder="e.g. Career fair, referral…"
                    className="mt-1 h-10 w-full text-foreground"
                    disabled={busy}
                  />
                </TextField>
              ) : null}
            </div>

            <div>
              <Label className={FIELD_LABEL}>Recruiter</Label>
              <TextField className="mt-1.5 flex w-full flex-col">
                <Input
                  value={recruiter}
                  onChange={(e) => {
                    recruiterTouchedRef.current = true;
                    setRecruiter(e.target.value);
                  }}
                  placeholder="Defaults to your username"
                  className="h-10 w-full text-foreground"
                  disabled={busy}
                />
              </TextField>
              <p className="mt-1 text-xs text-muted">
                Who sourced this CV — defaults to your username.
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-col">
            <Label className={FIELD_LABEL}>
              CV file
              <span className="ml-1 text-danger">*</span>
            </Label>
            {file ? (
              <div className="mt-1.5 flex items-center justify-between gap-3 rounded-xl border border-divider bg-content2/40 px-3 py-2.5">
                <span className="truncate text-sm font-medium text-foreground">
                  {file.name}
                </span>
                <Button
                  size="sm"
                  variant="tertiary"
                  className="cursor-pointer shrink-0"
                  isDisabled={busy}
                  onPress={() => handleFileChange(null)}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div
                className={`mt-1.5 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                  dragOver
                    ? "border-accent bg-accent/5"
                    : "border-divider bg-content2/30"
                } ${busy ? "pointer-events-none opacity-60" : ""}`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFileChange(e.dataTransfer.files?.[0] ?? null);
                }}
              >
                <span className="flex size-14 items-center justify-center rounded-full bg-content2 text-foreground">
                  <UploadCloud className="size-6" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Drop a CV here or select a file
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    No AI parsing or JD-match runs for manual entries — every
                    field below is used exactly as typed.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  className="cursor-pointer shrink-0"
                  isDisabled={busy}
                  onPress={() => fileInputRef.current?.click()}
                >
                  <UploadCloud className="size-4" aria-hidden />
                  Select file
                </Button>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <Chip size="sm" variant="soft" color="default">
                    PDF
                  </Chip>
                  <Chip size="sm" variant="soft" color="default">
                    DOCX
                  </Chip>
                  <Chip size="sm" variant="soft" color="default">
                    max 25MB
                  </Chip>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                handleFileChange(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <div className="pt-4 mt-4 border-t grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2 md:gap-x-6">
          {field("Name", "name", { required: true, fullWidth: true })}
          {field("Email", "email", { type: "email" })}
          {field("Phone", "phone")}
          {field("Role / title", "role")}
          {field("Degree", "degree")}
          {field("Education / school", "education")}
          {field("Years of experience", "experienceYears", { numeric: true })}
          {field("GPA", "gpa")}
          {field("English level", "englishLevel")}

          <div className="flex min-w-0 flex-col">
            <Label className={FIELD_LABEL}>Date of birth</Label>
            <div className="mt-1">
              <DatePickerField
                ariaLabel="Date of birth"
                value={draft.dateOfBirth}
                onChange={(v) => setDraft((d) => ({ ...d, dateOfBirth: v }))}
                isDisabled={busy}
              />
            </div>
          </div>

          {field("Student years", "studentYears")}

          <div className="min-w-0 md:col-span-2">
            <Label className={FIELD_LABEL}>Skills</Label>
            <p className="mt-0.5 text-xs text-muted">
              Type a skill and press Enter. Paste a comma-separated list to add
              several at once.
            </p>
            <div className="mt-2 flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-divider px-2 py-1.5">
              {draft.skills.map((s, idx) => (
                <Chip
                  key={`${s}-${idx}`}
                  size="sm"
                  variant="soft"
                  color="accent"
                  className="max-w-[200px] truncate border border-accent/40 bg-accent/10 text-xs font-semibold text-accent"
                >
                  {s}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    isIconOnly
                    className="size-5 min-w-5 shrink-0 text-danger hover:text-danger"
                    aria-label={`Remove ${s}`}
                    isDisabled={busy}
                    onPress={() => removeSkill(s)}
                  >
                    ×
                  </Button>
                </Chip>
              ))}
              <Input
                aria-label="Add skill"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkills(skillsFromText(skillInput));
                    setSkillInput("");
                  } else if (
                    e.key === "Backspace" &&
                    skillInput === "" &&
                    draft.skills.length > 0
                  ) {
                    removeSkill(draft.skills[draft.skills.length - 1]);
                  }
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (text.includes(",")) {
                    e.preventDefault();
                    addSkills(skillsFromText(text));
                  }
                }}
                className="min-w-[120px] flex-1 border-0 bg-transparent text-sm text-foreground outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
);
