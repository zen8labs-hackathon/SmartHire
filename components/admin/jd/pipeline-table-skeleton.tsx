import { Card, Table } from "@heroui/react";

const LOADING_ROW_IDS = [
  "jd-pipeline-loading-1",
  "jd-pipeline-loading-2",
  "jd-pipeline-loading-3",
  "jd-pipeline-loading-4",
  "jd-pipeline-loading-5",
];

/**
 * Suspense fallback for just the `JobPipelineDataPanel` card on
 * `/admin/jd/[jobId]/pipeline` (i.e. the part of `JobPipelineSpreadsheet`
 * gated on `use(pipelineDataPromise)`). Mirrors the row skeleton in
 * `app/admin/jd/[jobId]/pipeline/loading.tsx`, which remains the route-level
 * fallback shown before any HTML streams; the breadcrumbs, title, and Add
 * candidates buttons render outside this boundary and don't need a skeleton.
 */
export function PipelineTableSkeleton() {
  return (
    <Card variant="secondary" className="border-divider animate-pulse">
      <Card.Content className="p-0">
        <Table aria-label="Loading pipeline candidates">
          <Table.ScrollContainer>
            <Table.Content>
              <Table.Header>
                <Table.Column isRowHeader>Candidate</Table.Column>
                <Table.Column>Stage</Table.Column>
                <Table.Column>Sub-stage</Table.Column>
                <Table.Column>Match</Table.Column>
                <Table.Column>Updated</Table.Column>
              </Table.Header>
              <Table.Body>
                {LOADING_ROW_IDS.map((id) => (
                  <Table.Row key={id} id={id}>
                    <Table.Cell>
                      <div className="my-1 h-4 w-40 rounded bg-default-200" />
                    </Table.Cell>
                    <Table.Cell>
                      <div className="my-1 h-4 w-20 rounded bg-default-100" />
                    </Table.Cell>
                    <Table.Cell>
                      <div className="my-1 h-4 w-24 rounded bg-default-100" />
                    </Table.Cell>
                    <Table.Cell>
                      <div className="my-1 h-4 w-12 rounded bg-default-100" />
                    </Table.Cell>
                    <Table.Cell>
                      <div className="my-1 h-4 w-24 rounded bg-default-100" />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </Card.Content>
    </Card>
  );
}
