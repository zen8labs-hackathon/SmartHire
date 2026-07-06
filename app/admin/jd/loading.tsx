import { Card, Table } from "@heroui/react";

const LOADING_ROW_IDS = [
  "jd-loading-1",
  "jd-loading-2",
  "jd-loading-3",
  "jd-loading-4",
  "jd-loading-5",
];

export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="animate-pulse">
        <div className="h-7 w-48 rounded bg-default-200" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-default-100" />
      </div>

      <Card variant="secondary" className="border-divider animate-pulse">
        <Card.Content className="p-0">
          <Table aria-label="Loading job descriptions">
            <Table.ScrollContainer>
              <Table.Content>
                <Table.Header>
                  <Table.Column isRowHeader>Position</Table.Column>
                  <Table.Column>Chapter</Table.Column>
                  <Table.Column>Openings</Table.Column>
                  <Table.Column>Updated</Table.Column>
                </Table.Header>
                <Table.Body>
                  {LOADING_ROW_IDS.map((id) => (
                    <Table.Row key={id} id={id}>
                      <Table.Cell>
                        <div className="my-1 h-4 w-48 rounded bg-default-200" />
                      </Table.Cell>
                      <Table.Cell>
                        <div className="my-1 h-4 w-24 rounded bg-default-100" />
                      </Table.Cell>
                      <Table.Cell>
                        <div className="my-1 h-4 w-16 rounded bg-default-100" />
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
