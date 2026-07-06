import { Card, Table } from "@heroui/react";

const LOADING_ROW_IDS = [
  "candidates-loading-1",
  "candidates-loading-2",
  "candidates-loading-3",
  "candidates-loading-4",
  "candidates-loading-5",
];

/**
 * Suspense fallback for just the filters+table region of `/admin/candidates`
 * (i.e. the part of `CandidatePipelineDashboard` gated on
 * `use(candidatesPromise)`). Mirrors the row skeleton in
 * `app/admin/candidates/loading.tsx`, which remains the route-level fallback
 * shown before any HTML streams; the title and Add Candidate button render
 * outside this boundary and don't need a skeleton.
 */
export function CandidateTableSkeleton() {
  return (
    <div className="flex flex-col gap-8 animate-pulse">
      <Card variant="secondary" className="border-divider">
        <Card.Content className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
          <div className="h-10 min-w-0 flex-1 rounded-xl bg-default-100" />
          <div className="h-10 w-full shrink-0 rounded-xl bg-default-100 sm:w-56" />
          <div className="h-10 w-24 shrink-0 rounded-xl bg-default-200" />
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="gap-0 p-0">
          <Table aria-label="Loading candidates">
            <Table.ScrollContainer>
              <Table.Content>
                <Table.Header>
                  <Table.Column isRowHeader>Candidate &amp; Role</Table.Column>
                  <Table.Column className="text-center">Exp.</Table.Column>
                  <Table.Column>Key Skills</Table.Column>
                  <Table.Column>Education</Table.Column>
                  <Table.Column className="whitespace-nowrap">
                    Uploaded at
                  </Table.Column>
                  <Table.Column className="text-right">Actions</Table.Column>
                </Table.Header>
                <Table.Body>
                  {LOADING_ROW_IDS.map((id) => (
                    <Table.Row key={id} id={id}>
                      <Table.Cell>
                        <div className="my-1 h-4 w-40 rounded bg-default-200" />
                      </Table.Cell>
                      <Table.Cell>
                        <div className="mx-auto my-1 h-4 w-8 rounded bg-default-100" />
                      </Table.Cell>
                      <Table.Cell>
                        <div className="my-1 h-4 w-32 rounded bg-default-100" />
                      </Table.Cell>
                      <Table.Cell>
                        <div className="my-1 h-4 w-32 rounded bg-default-100" />
                      </Table.Cell>
                      <Table.Cell>
                        <div className="my-1 h-4 w-24 rounded bg-default-100" />
                      </Table.Cell>
                      <Table.Cell>
                        <div className="my-1 ml-auto h-4 w-16 rounded bg-default-100" />
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Card.Content>
      </Card>
    </div>
  );
}
