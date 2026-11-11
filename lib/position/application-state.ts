export function applicationStoppedSql(): string {
    return `(
        ca.ended_at IS NOT NULL
        OR EXISTS (
            SELECT 1
            FROM pipeline_sub_stages stopped_sub
            WHERE stopped_sub.id = ca.current_sub_state_id
            AND (
                stopped_sub.is_withdraw
                OR (
                    stopped_sub.is_terminal
                    AND NOT stopped_sub.is_passed
                )
            )
        )
    )`
}
