/**
 * Teleport
 * Copyright (C) 2024  Gravitational, Inc.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import styled from 'styled-components';

import { Box, Flex, H3, Link, Mark } from 'design';
import { Danger } from 'design/Alert';
import { P } from 'design/Text/Text';
import { IconTooltip } from 'design/Tooltip';
import TextEditor from 'shared/components/TextEditor';
import { useAsync } from 'shared/hooks/useAsync';

import { TextSelectCopyMulti } from 'teleport/components/TextSelectCopy';
import cfg from 'teleport/config';
import { Container } from 'teleport/Discover/Shared/CommandBox';
import { useDiscover } from 'teleport/Discover/useDiscover';
import { integrationService } from 'teleport/services/integrations';
import { splitAwsIamArn } from 'teleport/services/integrations/aws';

import { ActionButtons, Header } from '../../Shared';
import { AppCreatedDialog } from './AppCreatedDialog';

const IAM_POLICY_NAME = 'AWSAppAccess';

export function CreateAppAccess() {
  const { agentMeta, updateAgentMeta, emitErrorEvent, nextStep } =
    useDiscover();
  const { awsIntegration } = agentMeta;

  const [attempt, createApp] = useAsync(async () => {
    try {
      const app = await integrationService.createAwsAppAccess(
        awsIntegration.name
      );
      updateAgentMeta({
        ...agentMeta,
        app,
        resourceName: app.name,
      });
    } catch (err) {
      emitErrorEvent(err.message);
      throw err;
    }
  });

  const { awsAccountId: accountID, arnResourceName: iamRoleName } =
    splitAwsIamArn(agentMeta.awsIntegration.spec.roleArn);
  const scriptUrl = cfg.getAwsIamConfigureScriptAppAccessUrl({
    iamRoleName,
    accountID,
  });

  return (
    <Box maxWidth="800px">
      <Header>Enable Access to AWS with Teleport Application Access</Header>
      <P mt={1} mb={3}>
        An application will be created that will use the selected AWS OIDC
        Integration <Mark>{agentMeta.awsIntegration.name}</Mark> for proxying
        access to AWS Management Console, AWS CLI, and AWS APIs.
      </P>
      {attempt.status === 'error' && (
        <Danger mt={3}>{attempt.statusText}</Danger>
      )}
      <Container>
        <Flex alignItems="center" gap={1} mb={1}>
          <H3>First configure your AWS IAM permissions</H3>
          <IconTooltip sticky={true} maxWidth={450}>
            The following IAM permissions will be added as an inline policy
            named <Mark>{IAM_POLICY_NAME}</Mark> to IAM role{' '}
            <Mark>{iamRoleName}</Mark>
            <Box mb={2}>
              <EditorWrapper $height={250}>
                <TextEditor
                  readOnly={true}
                  data={[{ content: inlinePolicyJson, type: 'json' }]}
                  bg="levels.deep"
                />
              </EditorWrapper>
            </Box>
          </IconTooltip>
        </Flex>
        <P mb={2}>
          Run the command below on your{' '}
          <Link
            href="https://console.aws.amazon.com/cloudshell/home"
            target="_blank"
          >
            AWS CloudShell
          </Link>{' '}
          to configure your IAM permissions.
        </P>
        <TextSelectCopyMulti
          lines={[{ text: `bash -c "$(curl '${scriptUrl}')"` }]}
        />
      </Container>

      <ActionButtons
        onProceed={createApp}
        disableProceed={
          attempt.status === 'processing' || attempt.status === 'success'
        }
      />
      {attempt.status === 'success' && (
        <AppCreatedDialog
          toNextStep={nextStep}
          appName={agentMeta.resourceName}
        />
      )}
    </Box>
  );
}

const EditorWrapper = styled(Flex)<{ $height: number }>`
  flex-directions: column;
  height: ${p => p.$height}px;
  margin-top: ${p => p.theme.space[3]}px;
  width: 450px;
`;

const inlinePolicyJson = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AssumeTaggedRole",
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "*",
      "Condition": {
        "StringEquals": {"iam:ResourceTag/teleport.dev/integration": "true"}
      }
    }
  ]
}`;
