const nvItem = {}
nvItem.ZCD_NV_EX_LEGACY =                  0x0000
nvItem.ZCD_NV_EX_ADDRMGR =                 0x0001
nvItem.ZCD_NV_EX_BINDING_TABLE =           0x0002
nvItem.ZCD_NV_EX_DEVICE_LIST =             0x0003


nvItem.ZCD_NV_EXTADDR =                    0x0001
nvItem.ZCD_NV_BOOTCOUNTER =                0x0002
nvItem.ZCD_NV_STARTUP_OPTION =             0x0003
nvItem.ZCD_NV_START_DELAY =                0x0004


nvItem.ZCD_NV_NIB =                        0x0021
nvItem.ZCD_NV_DEVICE_LIST =                0x0022
nvItem.ZCD_NV_ADDRMGR =                    0x0023
nvItem.ZCD_NV_POLL_RATE_OLD16 =            0x0024 
nvItem.ZCD_NV_POLL_RATE =                  0x0035
nvItem.ZCD_NV_QUEUED_POLL_RATE =           0x0025
nvItem.ZCD_NV_RESPONSE_POLL_RATE =         0x0026
nvItem.ZCD_NV_REJOIN_POLL_RATE =           0x0027
nvItem.ZCD_NV_DATA_RETRIES =               0x0028
nvItem.ZCD_NV_POLL_FAILURE_RETRIES =       0x0029
nvItem.ZCD_NV_STACK_PROFILE =              0x002A
nvItem.ZCD_NV_INDIRECT_MSG_TIMEOUT =       0x002B
nvItem.ZCD_NV_ROUTE_EXPIRY_TIME =          0x002C
nvItem.ZCD_NV_EXTENDED_PAN_ID =            0x002D
nvItem.ZCD_NV_BCAST_RETRIES =              0x002E
nvItem.ZCD_NV_PASSIVE_ACK_TIMEOUT =        0x002F
nvItem.ZCD_NV_BCAST_DELIVERY_TIME =        0x0030
nvItem.ZCD_NV_NWK_MODE =                   0x0031
nvItem.ZCD_NV_CONCENTRATOR_ENABLE =        0x0032
nvItem.ZCD_NV_CONCENTRATOR_DISCOVERY =     0x0033
nvItem.ZCD_NV_CONCENTRATOR_RADIUS =        0x0034
                                       
nvItem.ZCD_NV_CONCENTRATOR_RC =            0x0036
nvItem.ZCD_NV_NWK_MGR_MODE =               0x0037
nvItem.ZCD_NV_SRC_RTG_EXPIRY_TIME =        0x0038
nvItem.ZCD_NV_ROUTE_DISCOVERY_TIME =       0x0039
nvItem.ZCD_NV_NWK_ACTIVE_KEY_INFO =        0x003A
nvItem.ZCD_NV_NWK_ALTERN_KEY_INFO =        0x003B
nvItem.ZCD_NV_ROUTER_OFF_ASSOC_CLEANUP =   0x003C
nvItem.ZCD_NV_NWK_LEAVE_REQ_ALLOWED =      0x003D
nvItem.ZCD_NV_NWK_CHILD_AGE_ENABLE =       0x003E
nvItem.ZCD_NV_DEVICE_LIST_KA_TIMEOUT =     0x003F


nvItem.ZCD_NV_BINDING_TABLE =              0x0041
nvItem.ZCD_NV_GROUP_TABLE =                0x0042
nvItem.ZCD_NV_APS_FRAME_RETRIES =          0x0043
nvItem.ZCD_NV_APS_ACK_WAIT_DURATION =      0x0044
nvItem.ZCD_NV_APS_ACK_WAIT_MULTIPLIER =    0x0045
nvItem.ZCD_NV_BINDING_TIME =               0x0046
nvItem.ZCD_NV_APS_USE_EXT_PANID =          0x0047
nvItem.ZCD_NV_APS_USE_INSECURE_JOIN =      0x0048
nvItem.ZCD_NV_COMMISSIONED_NWK_ADDR =      0x0049

nvItem.ZCD_NV_APS_NONMEMBER_RADIUS =       0x004B     
nvItem.ZCD_NV_APS_LINK_KEY_TABLE =         0x004C
nvItem.ZCD_NV_APS_DUPREJ_TIMEOUT_INC =     0x004D
nvItem.ZCD_NV_APS_DUPREJ_TIMEOUT_COUNT =   0x004E
nvItem.ZCD_NV_APS_DUPREJ_TABLE_SIZE =      0x004F


nvItem.ZCD_NV_DIAGNOSTIC_STATS =           0x0050


nvItem.ZCD_NV_NWK_PARENT_INFO =            0x0051
nvItem.ZCD_NV_NWK_ENDDEV_TIMEOUT_DEF =     0x0052
nvItem.ZCD_NV_END_DEV_TIMEOUT_VALUE =      0x0053
nvItem.ZCD_NV_END_DEV_CONFIGURATION =      0x0054
  
nvItem.ZCD_NV_BDBNODEISONANETWORK =        0x0055  
nvItem.ZCD_NV_BDBREPORTINGCONFIG =         0x0056
  

nvItem.ZCD_NV_SECURITY_LEVEL =             0x0061
nvItem.ZCD_NV_PRECFGKEY =                  0x0062
nvItem.ZCD_NV_PRECFGKEYS_ENABLE =          0x0063
nvItem.ZCD_NV_SECURITY_MODE =              0x0064
nvItem.ZCD_NV_SECURE_PERMIT_JOIN =         0x0065
nvItem.ZCD_NV_APS_LINK_KEY_TYPE =          0x0066
nvItem.ZCD_NV_APS_ALLOW_R19_SECURITY =     0x0067
nvItem.ZCD_NV_DISTRIBUTED_KEY =            0x0068 

nvItem.ZCD_NV_IMPLICIT_CERTIFICATE =       0x0069
nvItem.ZCD_NV_DEVICE_PRIVATE_KEY =         0x006A
nvItem.ZCD_NV_CA_PUBLIC_KEY =              0x006B
nvItem.ZCD_NV_KE_MAX_DEVICES =             0x006C

nvItem.ZCD_NV_USE_DEFAULT_TCLK =           0x006D

nvItem.ZCD_NV_RNG_COUNTER =                0x006F
nvItem.ZCD_NV_RANDOM_SEED =                0x0070
nvItem.ZCD_NV_TRUSTCENTER_ADDR =           0x0071

nvItem.ZCD_NV_CERT_283 =                   0x0072
nvItem.ZCD_NV_PRIVATE_KEY_283 =            0x0073
nvItem.ZCD_NV_PUBLIC_KEY_283 =             0x0074

nvItem.ZCD_NV_NWK_SEC_MATERIAL_TABLE_START = 0x0075
nvItem.ZCD_NV_NWK_SEC_MATERIAL_TABLE_END =   0x0080   
nvItem.ZCD_NV_USERDESC =                   0x0081
nvItem.ZCD_NV_NWKKEY =                     0x0082
nvItem.ZCD_NV_PANID =                      0x0083
nvItem.ZCD_NV_CHANLIST =                   0x0084
nvItem.ZCD_NV_LEAVE_CTRL =                 0x0085
nvItem.ZCD_NV_SCAN_DURATION =              0x0086
nvItem.ZCD_NV_LOGICAL_TYPE =               0x0087
nvItem.ZCD_NV_NWKMGR_MIN_TX =              0x0088
nvItem.ZCD_NV_NWKMGR_ADDR =                0x0089

nvItem.ZCD_NV_ZDO_DIRECT_CB =              0x008F
nvItem.ZCD_NV_SCENE_TABLE =                0x0091
nvItem.ZCD_NV_MIN_FREE_NWK_ADDR =          0x0092
nvItem.ZCD_NV_MAX_FREE_NWK_ADDR =          0x0093
nvItem.ZCD_NV_MIN_FREE_GRP_ID =            0x0094
nvItem.ZCD_NV_MAX_FREE_GRP_ID =            0x0095
nvItem.ZCD_NV_MIN_GRP_IDS =                0x0096
nvItem.ZCD_NV_MAX_GRP_IDS =                0x0097
nvItem.ZCD_NV_OTA_BLOCK_REQ_DELAY =        0x0098
nvItem.ZCD_NV_SAPI_ENDPOINT =              0x00A1
nvItem.ZCD_NV_SAS_SHORT_ADDR =             0x00B1
nvItem.ZCD_NV_SAS_EXT_PANID =              0x00B2
nvItem.ZCD_NV_SAS_PANID =                  0x00B3
nvItem.ZCD_NV_SAS_CHANNEL_MASK =           0x00B4
nvItem.ZCD_NV_SAS_PROTOCOL_VER =           0x00B5
nvItem.ZCD_NV_SAS_STACK_PROFILE =          0x00B6
nvItem.ZCD_NV_SAS_STARTUP_CTRL =           0x00B7

nvItem.ZCD_NV_SAS_TC_ADDR =                0x00C1
nvItem.ZCD_NV_SAS_TC_MASTER_KEY =          0x00C2
nvItem.ZCD_NV_SAS_NWK_KEY =                0x00C3
nvItem.ZCD_NV_SAS_USE_INSEC_JOIN =         0x00C4
nvItem.ZCD_NV_SAS_PRECFG_LINK_KEY =        0x00C5
nvItem.ZCD_NV_SAS_NWK_KEY_SEQ_NUM =        0x00C6
nvItem.ZCD_NV_SAS_NWK_KEY_TYPE =           0x00C7
nvItem.ZCD_NV_SAS_NWK_MGR_ADDR =           0x00C8

nvItem.ZCD_NV_SAS_CURR_TC_MASTER_KEY =     0x00D1
nvItem.ZCD_NV_SAS_CURR_NWK_KEY =           0x00D2
nvItem.ZCD_NV_SAS_CURR_PRECFG_LINK_KEY =   0x00D3



nvItem.ZCD_NV_TCLK_SEED =                  0x0101  
nvItem.ZCD_NV_TCLK_JOIN_DEV =              0x0102  
nvItem.ZCD_NV_TCLK_DEFAULT =               0x0103  
  
nvItem.ZCD_NV_TCLK_IC_TABLE_START =        0x0104  
nvItem.ZCD_NV_TCLK_IC_TABLE_END =          0x0110
   
nvItem.ZCD_NV_TCLK_TABLE_START =           0x0111  
nvItem.ZCD_NV_TCLK_TABLE_END =             0x01FF



nvItem.ZCD_NV_APS_LINK_KEY_DATA_START =    0x0201     
nvItem.ZCD_NV_APS_LINK_KEY_DATA_END =      0x02FF


nvItem.ZCD_NV_DUPLICATE_BINDING_TABLE =            0x0300
nvItem.ZCD_NV_DUPLICATE_DEVICE_LIST =              0x0301
nvItem.ZCD_NV_DUPLICATE_DEVICE_LIST_KA_TIMEOUT =   0x0302



nvItem.ZCD_NV_PROXY_TABLE_START =                  0x0310
nvItem.ZCD_NV_PROXY_TABLE_END =                    0x033F
module.exports = nvItem