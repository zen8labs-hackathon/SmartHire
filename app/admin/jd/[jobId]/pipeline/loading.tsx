import { Card, Table } from "@heroui/react";

const LOADING_ROW_IDS = [
  "pipeline-loading-1",
  "pipeline-loading-2",
  "pipeline-loading-3",
  "pipeline-loading-4",
  "pipeline-loading-5",
];

export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="animate-pulse">
        <div className="h-7 w-64 rounded bg-default-200" />
        <div className="mt-2 h-4 w-80 max-w-full rounded bg-default-100" />
      </div>

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
    </div>
  );
}
