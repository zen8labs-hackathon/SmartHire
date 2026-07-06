import { Card, Table } from "@heroui/react";

const LOADING_ROW_IDS = [
  "candidates-loading-1",
  "candidates-loading-2",
  "candidates-loading-3",
  "candidates-loading-4",
  "candidates-loading-5",
];

export default function Loading() {
  return (
    <Card variant="secondary" className="border-divider animate-pulse">
      <Card.Header className="border-b border-divider px-5 py-4">
        <div className="h-5 w-40 rounded bg-default-200" />
        <div className="mt-1.5 h-4 w-56 rounded bg-default-100" />
      </Card.Header>
      <Card.Content className="p-0">
        <Table aria-label="Loading candidates">
          <Table.ScrollContainer>
            <Table.Content>
              <Table.Header>
                <Table.Column isRowHeader>Candidate</Table.Column>
                <Table.Column>Job</Table.Column>
                <Table.Column>Status</Table.Column>
                <Table.Column>Updated</Table.Column>
              </Table.Header>
              <Table.Body>
                {LOADING_ROW_IDS.map((id) => (
                  <Table.Row key={id} id={id}>
                    <Table.Cell>
                      <div className="my-1 h-4 w-40 rounded bg-default-200" />
                    </Table.Cell>
                    <Table.Cell>
                      <div className="my-1 h-4 w-32 rounded bg-default-100" />
                    </Table.Cell>
                    <Table.Cell>
                      <div className="my-1 h-4 w-20 rounded bg-default-100" />
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
