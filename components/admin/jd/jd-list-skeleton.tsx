import { Card, Table } from "@heroui/react";

const STAT_CARD_IDS = [
  "jd-stat-loading-1",
  "jd-stat-loading-2",
  "jd-stat-loading-3",
  "jd-stat-loading-4",
  "jd-stat-loading-5",
];

const LOADING_ROW_IDS = [
  "jd-list-loading-1",
  "jd-list-loading-2",
  "jd-list-loading-3",
  "jd-list-loading-4",
  "jd-list-loading-5",
];

/**
 * Suspense fallback for the filters/stats/table region of `/admin/jd` (i.e.
 * the part of `JdManagementDashboard` gated on `use(initialRowsPromise)` via
 * `JdDashboardProvider`/`useJdListState`). The title and "New definition"
 * button (`JdHeader`) render outside this boundary as static shell content
 * and don't need a skeleton. Mirrors the table skeleton in
 * `app/admin/jd/loading.tsx`, which remains the route-level fallback shown
 * before any HTML streams.
 */
export function JdListSkeleton() {
  return (
    <div className="flex flex-col gap-8 animate-pulse">
      <Card variant="secondary">
        <Card.Content className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="h-10 min-w-[220px] flex-1 rounded-xl bg-default-100" />
            <div className="h-10 w-[200px] rounded-xl bg-default-100" />
            <div className="h-10 w-[280px] rounded-xl bg-default-100" />
          </div>
        </Card.Content>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {STAT_CARD_IDS.map((id) => (
          <Card key={id} variant="secondary">
            <Card.Header className="pb-2">
              <div className="h-4 w-20 rounded bg-default-100" />
            </Card.Header>
            <Card.Content className="pt-0">
              <div className="h-8 w-12 rounded bg-default-200" />
            </Card.Content>
          </Card>
        ))}
      </div>

      <Card className="border-divider">
        <Card.Content className="p-0">
          <Table aria-label="Loading job descriptions">
            <Table.ScrollContainer>
              <Table.Content className="min-w-[920px]">
                <Table.Header>
                  <Table.Column isRowHeader>Position</Table.Column>
                  <Table.Column className="text-center">Applicants</Table.Column>
                  <Table.Column>Department</Table.Column>
                  <Table.Column>Start date</Table.Column>
                  <Table.Column>End date</Table.Column>
                  <Table.Column>Hiring deadline</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Actions</Table.Column>
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
                        <div className="my-1 h-4 w-24 rounded bg-default-100" />
                      </Table.Cell>
                      <Table.Cell>
                        <div className="my-1 h-4 w-20 rounded bg-default-100" />
                      </Table.Cell>
                      <Table.Cell>
                        <div className="my-1 h-4 w-20 rounded bg-default-100" />
                      </Table.Cell>
                      <Table.Cell>
                        <div className="my-1 h-4 w-20 rounded bg-default-100" />
                      </Table.Cell>
                      <Table.Cell>
                        <div className="my-1 h-4 w-24 rounded bg-default-100" />
                      </Table.Cell>
                      <Table.Cell>
                        <div className="my-1 h-4 w-16 rounded bg-default-100" />
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
