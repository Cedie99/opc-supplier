import { asc } from "drizzle-orm";
import { PencilIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { FormDialog } from "@/components/form/form-dialog";
import { CheckboxField, SelectField, TextField } from "@/components/form/fields";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/constants";
import { createUser, updateUser } from "../actions";

export const metadata = { title: "Users" };

const PERMISSION_LABELS: Record<keyof typeof PERMISSIONS, string> = {
  manageSuppliers: "Register and edit suppliers",
  uploadDocuments: "Upload and replace documents",
  verifyDocuments: "Verify or reject documents",
  editCanvass: "Fill in Selection Matrix ratings (own fields)",
  prepareCanvass: "Create, recommend and submit a canvass",
  editEvaluation: "Fill in quarterly evaluation ratings (own fields)",
  prepareEvaluation: "Create and submit quarterly evaluations",
  approve: "Approve canvasses, evaluations and status changes",
  manageCorrectiveActions: "Manage corrective actions",
  logActivity: "Log requests and complaints",
  inviteSuppliers: "Send registration and re-upload links",
  manageSettings: "Change templates and reference data",
  manageUsers: "Manage users",
};

export default async function UsersPage() {
  const me = await requireUser("manageUsers");
  const users = await db.select().from(profiles).orderBy(asc(profiles.fullName));
  const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  return (
    <>
      <PageHeader
        title="Users"
        description="Staff accounts and their roles."
        actions={
          <FormDialog
            trigger={
              <Button>
                <PlusIcon /> Add user
              </Button>
            }
            title="Add a staff user"
            description="Creates a sign-in account. Share the temporary password privately and ask the user to change it."
            action={createUser}
            submitLabel="Create user"
          >
            <TextField label="Full name" name="fullName" required />
            <TextField label="Email" name="email" type="email" required />
            <SelectField label="Role" name="role" defaultValue="buyer" options={roleOptions} />
            <TextField label="Department" name="department" />
            <TextField label="Temporary password" name="password" type="password" required minLength={10} autoComplete="new-password" />
          </FormDialog>
        }
      />
      <div className="grid gap-6">
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <span className="font-medium">{u.fullName}</span>
                    <span className="text-muted-foreground block text-xs">{u.email}</span>
                  </TableCell>
                  <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                  <TableCell className="text-sm">{u.department ?? "—"}</TableCell>
                  <TableCell>{u.isActive ? <Pill tone="green">Active</Pill> : <Pill tone="gray">Deactivated</Pill>}</TableCell>
                  <TableCell className="text-right">
                    <FormDialog
                      trigger={
                        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${u.fullName}`}>
                          <PencilIcon />
                        </Button>
                      }
                      title={`Edit ${u.fullName}`}
                      action={updateUser.bind(null, u.id)}
                    >
                      <SelectField label="Role" name="role" defaultValue={u.role} options={roleOptions} disabled={u.id === me.id} />
                      {u.id === me.id && <input type="hidden" name="role" value={u.role} />}
                      <TextField label="Department" name="department" defaultValue={u.department ?? ""} />
                      <CheckboxField name="isActive" label="Active (can sign in)" defaultChecked={u.isActive} />
                    </FormDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What each role can do</CardTitle>
            <CardDescription>Everyone can view suppliers, scores and reports.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Permission</TableHead>
                  {ROLES.map((r) => (
                    <TableHead key={r} className="text-center text-xs">
                      {ROLE_LABELS[r]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).map((p) => (
                  <TableRow key={p}>
                    <TableCell className="pl-6 text-sm">{PERMISSION_LABELS[p]}</TableCell>
                    {ROLES.map((r) => (
                      <TableCell key={r} className="text-center">
                        {(PERMISSIONS[p] as readonly Role[]).includes(r) ? "✓" : ""}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
