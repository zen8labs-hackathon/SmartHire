"use client";

import { useState, useEffect } from "react";
import { useOverlayTriggerState } from "react-stately";
import { Button, Input, Modal, Label } from "@heroui/react";
import {
  getMyProfileDetails,
  updateMyPassword,
  updateMyUsername,
} from "@/app/account/actions";
import { useToast } from "@/components/admin/toast-provider";
import { Loader2, User, KeyRound, Shield, Compass, Mail } from "lucide-react";

export type UserModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string;
  userRole: string;
};

export function UserModal({
  open,
  onOpenChange,
  userEmail,
  userRole,
}: UserModalProps) {
  const modalState = useOverlayTriggerState({
    isOpen: open,
    onOpenChange,
  });

  const { success: triggerSuccess, error: triggerError } = useToast();
  
  const [activeTab, setActiveTab] = useState<"details" | "edit" | "password">("details");
  const [username, setUsername] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [chapters, setChapters] = useState<string[]>([]);
  
  // Password fields
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Fetch current profile details on open
  useEffect(() => {
    if (!open) return;
    
    async function loadProfile() {
      setLoadingProfile(true);
      try {
        const details = await getMyProfileDetails();
        if (!details) return;
        setUsername(details.username);
        setChapters(details.chapterNames);
      } catch (err: any) {
        console.error("Error loading user profile details", err);
      } finally {
        setLoadingProfile(false);
      }
    }

    loadProfile();
  }, [open]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      triggerError("Name cannot be empty");
      return;
    }
    
    setUpdating(true);
    try {
      const result = await updateMyUsername(username.trim());
      if (result?.error) {
        triggerError(result.error);
        return;
      }
      triggerSuccess(result?.message || "Profile updated successfully!");
      setActiveTab("details");
    } catch (err: any) {
      triggerError(err.message || "Failed to update profile");
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      triggerError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      triggerError("Passwords do not match");
      return;
    }

    setUpdating(true);
    try {
      const result = await updateMyPassword(password);
      if (result?.error) {
        triggerError(result.error);
        return;
      }
      triggerSuccess(result?.message || "Password changed successfully!");
      setPassword("");
      setConfirmPassword("");
      setActiveTab("details");
    } catch (err: any) {
      triggerError(err.message || "Failed to update password");
    } finally {
      setUpdating(false);
    }
  };

  // Generate initials for avatar
  const initials = username
    ? username.slice(0, 2).toUpperCase()
    : userEmail.slice(0, 2).toUpperCase();

  return (
    <Modal state={modalState}>
      <Modal.Backdrop className="z-[140] bg-black/55 backdrop-blur-md">
        <Modal.Container className="z-[140] w-full max-w-[480px]">
          <Modal.Dialog className="max-h-[90vh] w-full overflow-hidden rounded-2xl border border-divider bg-surface-primary p-0 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <Modal.Header className="border-b border-divider bg-surface-secondary/40 px-6 py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gold font-sans text-xl font-bold text-brand-gold-foreground shadow-md shadow-black/15">
                  {initials}
                </div>
                <div className="min-w-0">
                  <Modal.Heading className="text-base font-semibold text-foreground">
                    {loadingProfile ? "Loading profile..." : username || "My Account"}
                  </Modal.Heading>
                  <p className="text-xs text-muted truncate mt-0.5">{userEmail}</p>
                </div>
              </div>
            </Modal.Header>

            {/* Navigation Tabs */}
            <div className="flex border-b border-divider bg-surface-secondary/20 px-3">
              <button
                type="button"
                onClick={() => setActiveTab("details")}
                className={`px-3 py-2.5 text-xs font-semibold tracking-wide border-b-2 transition-all duration-150 ${
                  activeTab === "details"
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                Profile Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("edit")}
                className={`px-3 py-2.5 text-xs font-semibold tracking-wide border-b-2 transition-all duration-150 ${
                  activeTab === "edit"
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                Edit Name
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("password")}
                className={`px-3 py-2.5 text-xs font-semibold tracking-wide border-b-2 transition-all duration-150 ${
                  activeTab === "password"
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                Security
              </button>
            </div>

            {/* Modal Body */}
            <Modal.Body className="px-6 py-6 min-h-[220px]">
              {activeTab === "details" && (
                <div className="space-y-4">
                  {/* Email row */}
                  <div className="flex items-center justify-between rounded-xl border border-divider/60 bg-surface-secondary/30 p-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <Mail className="h-4 w-4 text-muted shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Email address</p>
                        <p className="text-sm font-medium text-foreground mt-0.5 truncate">{userEmail}</p>
                      </div>
                    </div>
                  </div>

                  {/* Role row */}
                  <div className="flex items-center justify-between rounded-xl border border-divider/60 bg-surface-secondary/30 p-3.5">
                    <div className="flex items-center gap-3">
                      <Shield className="h-4 w-4 text-muted shrink-0" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Workspace role</p>
                        <span className="inline-flex mt-1 items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                          {userRole}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Chapters row */}
                  <div className="flex items-center justify-between rounded-xl border border-divider/60 bg-surface-secondary/30 p-3.5">
                    <div className="flex items-center gap-3">
                      <Compass className="h-4 w-4 text-muted shrink-0" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Assigned Chapters</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {chapters.length > 0 ? (
                            chapters.map((ch, idx) => (
                              <span key={idx} className="inline-flex items-center rounded-lg bg-surface-tertiary border border-divider px-2 py-0.5 text-xs text-foreground">
                                {ch}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted font-medium">None assigned</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "edit" && (
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-semibold text-foreground/80 tracking-wide">
                      Display Name
                    </Label>
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-divider bg-surface-secondary/40 text-sm text-foreground outline-none transition-all duration-200 hover:border-accent/40 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:bg-background"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl text-sm font-semibold shadow-md transition-colors duration-200 flex items-center justify-center gap-2 cursor-pointer"
                    isDisabled={updating}
                  >
                    {updating && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save changes
                  </Button>
                </form>
              )}

              {activeTab === "password" && (
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-semibold text-foreground/80 tracking-wide">
                      New Password
                    </Label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-divider bg-surface-secondary/40 text-sm text-foreground outline-none transition-all duration-200 hover:border-accent/40 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:bg-background"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-semibold text-foreground/80 tracking-wide">
                      Confirm New Password
                    </Label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-divider bg-surface-secondary/40 text-sm text-foreground outline-none transition-all duration-200 hover:border-accent/40 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:bg-background"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl text-sm font-semibold shadow-md transition-colors duration-200 flex items-center justify-center gap-2 cursor-pointer"
                    isDisabled={updating}
                  >
                    {updating && <Loader2 className="h-4 w-4 animate-spin" />}
                    Update Password
                  </Button>
                </form>
              )}
            </Modal.Body>

            {/* Modal Footer */}
            <Modal.Footer className="border-t border-divider bg-surface-secondary/40 px-6 py-4 flex items-center justify-end">
              <Button
                variant="secondary"
                onClick={() => onOpenChange(false)}
                className="px-4 py-2 border border-divider hover:bg-surface-tertiary rounded-xl text-xs font-medium"
              >
                Close
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
